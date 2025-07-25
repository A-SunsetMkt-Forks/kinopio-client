<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useCardStore } from '@/stores/useCardStore'
import { useBoxStore } from '@/stores/useBoxStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'
import { useBroadcastStore } from '@/stores/useBroadcastStore'

import utils from '@/utils.js'

import { getOverlapSize } from 'overlap-area'
import uniqBy from 'lodash-es/uniqBy'
import quadratic from 'adaptive-quadratic-curve'
import { nanoid } from 'nanoid'
import { colord } from 'colord'

const globalStore = useGlobalStore()
const cardStore = useCardStore()
const boxStore = useBoxStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()
const broadcastStore = useBroadcastStore()

let shouldSelect, currentBoxSelectId
let selectableItems = {}
let selectableConnections = {}
let previouslySelectedCardIds = []
let previouslySelectedConnectionIds = []
let previouslySelectedBoxesIds = []

const state = reactive({
  direction: 'to bottom right',
  previousBoxStyles: []
})

watch(() => globalStore.currentUserIsBoxSelecting, (value, prevValue) => {
  const isSelecting = value
  // before start selection
  if (isSelecting) {
    shouldSelect = true
    currentBoxSelectId = nanoid()
    updatePreviouslySelectedItems()
  // end selection
  } else {
    if (!shouldSelect) { return }
    shouldSelect = false
    state.previousBoxStyles.push(currentUserStyles.value)
    broadcastStore.update({ updates: currentUserStyles.value, action: 'updateRemotePreviousBoxSelectStyles' })
  }
})
watch(() => globalStore.currentUserBoxSelectStart, (value, prevValue) => {
  updateSelectableItems()
  updateSelectableConnections()
})
watch(() => globalStore.currentUserBoxSelectMove, (value, prevValue) => {
  if (shouldPreventBoxSelecting.value) { return }
  const { start, end, relativePosition } = orderedPoints(startPoint.value, endPoint.value)
  const selection = boxSelection(start, end)
  selectItems(selection, relativePosition)
  selectconnections(selection, relativePosition)
  broadcastStore.update({ updates: currentUserStyles.value, action: 'updateRemoteUserBoxSelectStyles' })
})

const currentUserIsBoxSelecting = computed(() => globalStore.currentUserIsBoxSelecting)
const startPoint = computed(() => positionInSpace(globalStore.currentUserBoxSelectStart))
const endPoint = computed(() => positionInSpace(globalStore.currentUserBoxSelectMove))
const userCantEditSpace = computed(() => !userStore.getUserCanEditSpace)
const shouldPreventBoxSelecting = computed(() => {
  if (globalStore.getToolbarIsDrawing) { return true }
  const isDraggingItem = globalStore.currentUserIsDraggingCard || globalStore.currentUserIsDraggingBox
  return isDraggingItem
})
const currentUserStyles = computed(() => {
  if (shouldPreventBoxSelecting.value) { return }
  const { start, end } = orderedPoints(startPoint.value, endPoint.value)
  const { left, top, width, height } = boxSelection(start, end)
  const color = userStore.color
  const color1 = colord(color).alpha(0.5).toRgbString()
  const color2 = colord(color).alpha(1).toRgbString()
  const gradient = `radial-gradient(farthest-corner at ${state.direction}, ${color1}, ${color2})`
  const styles = {
    left: left + 'px',
    top: top + 'px',
    width: width + 'px',
    height: height + 'px',
    background: gradient,
    userId: userStore.id,
    currentBoxSelectId
  }
  return styles
})
const spaceCounterZoomDecimal = computed(() => globalStore.getSpaceCounterZoomDecimal)
const remoteUserBoxSelectStyles = computed(() => globalStore.remoteUserBoxSelectStyles)
const remotePreviousUserBoxSelectStyles = computed(() => globalStore.remotePreviousUserBoxSelectStyles)

const removePreviousBoxStyle = () => {
  state.previousBoxStyles.shift()
}
const removePreviousRemoteBoxStyle = () => {
  globalStore.removeRemotePreviousBoxSelectStyle()
}
const positionInSpace = (point) => {
  return utils.cursorPositionInSpace(null, point)
}
const updatePreviouslySelectedItems = () => {
  previouslySelectedCardIds = globalStore.multipleCardsSelectedIds
  previouslySelectedConnectionIds = globalStore.multipleConnectionsSelectedIds
  previouslySelectedBoxesIds = globalStore.multipleBoxesSelectedIds
}
const boxSelection = (start, end) => {
  return {
    x: start.x,
    y: start.y,
    left: start.x,
    top: start.y,
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y)
  }
}
const updateDirection = (position) => {
  if (position === 'bottomLeft') {
    state.direction = 'right top'
  } else if (position === 'topLeft') {
    state.direction = 'right bottom'
  } else if (position === 'topRight') {
    state.direction = 'left bottom'
  } else {
    state.direction = 'left top'
  }
}
const orderedPoints = (start, end) => {
  //                    │
  //                    │
  //       topLeft      │      topRight
  //                    │
  //                    │
  //   end: x less &    │   end: x greater &
  //       y less       │       y less
  //                    │
  //                    │
  // ───────────────────┼─────────────────────
  //                    │
  //                    │    bottomRight
  //      bottomLeft    │     (default)
  //                    │
  //                    │
  //    end: x less &   │   end: x greater &
  //      y greater     │      y greater
  //                    │
  //                    │
  let relativePosition = 'bottomRight'
  if (end.x <= start.x && end.y <= start.y) {
    relativePosition = 'topLeft'
  } else if (end.x >= start.x && end.y <= start.y) {
    relativePosition = 'topRight'
  } else if (end.x <= start.x && end.y >= start.y) {
    relativePosition = 'bottomLeft'
  }
  let newStart, newEnd
  if (relativePosition === 'topLeft') {
    newStart = end
    newEnd = start
  } else if (relativePosition === 'topRight') {
    newStart = { x: start.x, y: end.y }
    newEnd = { x: end.x, y: start.y }
  } else if (relativePosition === 'bottomLeft') {
    newStart = { x: end.x, y: start.y }
    newEnd = { x: start.x, y: end.y }
  } else {
    newStart = start
    newEnd = end
  }
  updateDirection(relativePosition)
  return { start: newStart, end: newEnd, relativePosition }
}
const updateItems = (items) => {
  const origin = startPoint.value
  const selectable = { topLeft: [], topRight: [], bottomLeft: [], bottomRight: [] }
  items = items.map(item => {
    item.width = item.width || item.resizeWidth
    item.height = item.height || item.resizeHeight
    return item
  })
  items.forEach(item => {
    const { x, y } = item
    const width = item.width
    const height = item.height
    const isTop = y <= origin.y
    const isBottom = (y >= origin.y || y + height >= origin.y)
    const isLeft = x <= origin.x
    const isRight = (x >= origin.x || x + width >= origin.x)
    // group into quadrants
    if (isTop && isLeft) { selectable.topLeft.push(item) }
    if (isTop && isRight) { selectable.topRight.push(item) }
    if (isBottom && isLeft) { selectable.bottomLeft.push(item) }
    if (isBottom && isRight) { selectable.bottomRight.push(item) }
  })
  return selectable
}
const updateSelectableItems = () => {
  let cards = cardStore.getCardsSelectableInViewport()
  let boxes = boxStore.getBoxesSelectableInViewport()
  cards = cards.map(card => {
    card.isCard = true
    return card
  })
  const array = []
  boxes.forEach(box => {
    const element = document.querySelector(`.box-info[data-box-id="${box.id}"]`)
    if (!element) { return }
    if (element.dataset.isVisibleInViewport === 'false') { return }
    const rect = element.getBoundingClientRect()
    box = {
      id: box.id,
      name: box.name,
      x: box.x,
      y: box.y,
      width: rect.width,
      height: rect.height,
      isBox: true
    }
    array.push(box)
  })
  boxes = array
  boxes = boxes.filter(box => Boolean(box))
  const items = cards.concat(boxes)
  selectableItems = updateItems(items)
}
const updateSelectableConnections = () => {
  const paths = document.querySelectorAll('svg .connection-path')
  const connections = []
  paths.forEach(path => {
    const pathId = path.dataset.id
    const rect = path.getBoundingClientRect()
    const connection = {
      id: pathId,
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height)
    }
    connections.push(connection)
  })
  selectableConnections = updateItems(connections)
}
const points = (rect) => {
  const { x, y, height, width } = rect
  const x1 = x
  const x2 = x + width
  const y1 = y
  const y2 = y + height
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2]
  ]
}
const mergePreviouslySelected = (selectedIds, type) => {
  let previouslySelectedIds
  if (type === 'cards') {
    previouslySelectedIds = previouslySelectedCardIds
  } else if (type === 'connections') {
    previouslySelectedIds = previouslySelectedConnectionIds
  } else if (type === 'boxes') {
    previouslySelectedIds = previouslySelectedBoxesIds
  }
  previouslySelectedIds.forEach(id => {
    const index = selectedIds.indexOf(id)
    if (index >= 0) {
      selectedIds.splice(index, 1)
    } else {
      selectedIds.push(id)
    }
  })
  return selectedIds
}
const selectItems = (selection, relativePosition) => {
  if (userCantEditSpace.value) { return }
  const selectionPoints = points(selection)
  const items = selectableItems[relativePosition]
  if (!items) { return }
  let selectedItems = items.filter(item => {
    const itemPoints = points(item)
    return Boolean(getOverlapSize(selectionPoints, itemPoints))
  })
  selectedItems = uniqBy(selectedItems, 'id')
  const cards = selectedItems.filter(item => item.isCard)
  const boxes = selectedItems.filter(item => item.isBox)
  selectItemsByType(cards, 'cards')
  selectItemsByType(boxes, 'boxes')
}
const selectItemsByType = (items, type) => {
  let selectedItemIds = items.map(item => item.id)
  selectedItemIds = mergePreviouslySelected(selectedItemIds, type)
  if (type === 'cards') {
    globalStore.updateMultipleCardsSelectedIds(selectedItemIds)
  } else if (type === 'boxes') {
    globalStore.updateMultipleBoxesSelectedIds(selectedItemIds)
  }
}
const pointsAlongPath = (connection) => {
  const element = document.querySelector(`svg .connection-path[data-id='${connection.id}']`)
  if (!element) { return }
  const pathData = element.getPathData()
  let m, q
  pathData.forEach(data => {
    if (data.type === 'm') {
      m = data.values
    } else if (data.type === 'q') {
      q = data.values
    }
  })
  const start = [m[0], m[1]]
  const startX = start[0]
  const startY = start[1]
  const c1 = [startX + q[0], startY + q[1]]
  const end = [startX + q[2], startY + q[3]]
  const scale = 2
  return quadratic(start, c1, end, scale) // [[x1,x2], [x2,x2], …]
}
const selectconnections = (selection, relativePosition) => {
  if (userCantEditSpace.value) { return }
  const connections = selectableConnections[relativePosition]
  if (!connections) { return }
  let selectedConnections = connections.filter(connection => {
    const points = pointsAlongPath(connection)
    if (!points) { return }
    if (!points.length) { return }
    const isSelected = points.find(point => {
      const x = Math.round(point[0])
      const y = Math.round(point[1])
      const xIsInBox = utils.isBetween({ value: x, min: selection.x, max: selection.x + selection.width })
      const yIsInBox = utils.isBetween({ value: y, min: selection.y, max: selection.y + selection.height })
      return xIsInBox && yIsInBox
    })
    return Boolean(isSelected)
  })
  selectedConnections = uniqBy(selectedConnections, 'id')
  let selectedIds = selectedConnections.map(connection => connection.id)
  selectedIds = mergePreviouslySelected(selectedIds, 'connections')
  globalStore.updateMultipleConnectionsSelectedIds(selectedIds)
}

</script>

<template lang="pug">
.box-selecting
  .box-select(v-if="currentUserIsBoxSelecting" :style="currentUserStyles")
  template(v-for="style in state.previousBoxStyles")
    .box-select.hide-me(:style="style" @animationend="removePreviousBoxStyle")
  //- remote
  template(v-for="style in remoteUserBoxSelectStyles")
    .box-select(:style="style")
  template(v-for="style in remotePreviousUserBoxSelectStyles")
    .box-select.hide-me(:style="style" @animationend="removePreviousRemoteBoxStyle")
</template>

<style lang="stylus">
.box-selecting
  pointer-events none
  position absolute
  top 0
  left 0
  width 100%
  height 100%
  .box-select
    position absolute
  .hide-me
    animation-name hideme
    animation-duration 0.5s
    animation-iteration-count 1
    animation-direction forward
    animation-fill-mode forwards
    animation-timing-function ease-out
</style>
