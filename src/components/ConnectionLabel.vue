<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useCardStore } from '@/stores/useCardStore'
import { useConnectionStore } from '@/stores/useConnectionStore'
import { useBoxStore } from '@/stores/useBoxStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'
import { useBroadcastStore } from '@/stores/useBroadcastStore'

import utils from '@/utils.js'

const globalStore = useGlobalStore()
const cardStore = useCardStore()
const connectionStore = useConnectionStore()
const boxStore = useBoxStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()
const broadcastStore = useBroadcastStore()

const labelElement = ref(null)

let cursorStart = {}
let wasDragged = false
let positionAbsoluteStart
let prevLabelRelativePosition

// locking
// long press to touch drag
const lockingPreDuration = 100 // ms
const lockingDuration = 100 // ms
let lockingAnimationTimer, lockingStartTime, shouldCancelLocking
let isMultiTouch
let initialTouchEvent = {}
let touchPosition = {}
let currentTouchPosition = {}

onMounted(() => {
  window.addEventListener('mouseup', stopDragging)
  window.addEventListener('pointermove', drag)
  // wait for connection element to be in dom
  setTimeout(() => {
    state.connectionIsVisible = true
    updateConnectionRect()
  }, 50)
})
onBeforeUnmount(() => {
  window.removeEventListener('mouseup', stopDragging)
  window.removeEventListener('pointermove', drag)
})

const props = defineProps({
  connection: Object
})
watch(() => props.connection.labelIsVisible, (value, prevValue) => {
  if (value) {
    updateConnectionRect()
    state.connectionIsVisible = true
  } else {
    connectionStore.clearConnectionLabelPosition(props.connection.id)
  }
})

const state = reactive({
  hover: false,
  connectionIsVisible: false,
  outOfBounds: {},
  isDragging: false,
  connectionRect: null,
  currentCursor: null,
  // touch
  isLocking: false,
  lockingPercent: 0,
  lockingAlpha: 0
})
watch(() => state.hover, (value, prevValue) => {
  if (value) {
    globalStore.currentUserIsHoveringOverConnectionId = id.value
  } else {
    globalStore.currentUserIsHoveringOverConnectionId = ''
  }
})
watch(() => state.isDragging, (value, prevValue) => {
  if (value) {
    globalStore.currentUserIsDraggingConnectionIdLabel = id.value
  } else {
    globalStore.currentUserIsDraggingConnectionIdLabel = ''
  }
})

const canEditSpace = computed(() => userStore.getUserCanEditSpace)
const isDark = computed(() => utils.colorIsDark(typeColor.value))
const checkIsMultiTouch = (event) => {
  isMultiTouch = false
  if (utils.isMultiTouch(event)) {
    isMultiTouch = true
  }
}

// parent connection

const id = computed(() => props.connection.id)
const connectionDetailsIsVisible = computed(() => globalStore.connectionDetailsIsVisibleForConnectionId === id.value)
const toggleConnectionDetails = (event) => {
  if (isMultiTouch) { return }
  const isVisible = globalStore.connectionDetailsIsVisibleForConnectionId === id.value
  if (isVisible || wasDragged) {
    wasDragged = false
    globalStore.closeAllDialogs()
  } else {
    globalStore.triggerConnectionDetailsIsVisible(id.value)
  }
}
const items = computed(() => {
  const cards = cardStore.getAllCards
  const boxes = boxStore.getAllBoxes
  const items = cards.concat(boxes)
  const startItem = items.find(item => item.id === props.connection.startItemId)
  const endItem = items.find(item => item.id === props.connection.endItemId)
  return { startItem, endItem }
})

// visible

const visible = computed(() => {
  return state.connectionIsVisible && props.connection.labelIsVisible
})

// filter

const filtersIsActive = computed(() => {
  const types = globalStore.filteredConnectionTypeIds
  const frames = globalStore.filteredFrameIds
  return Boolean(types.length + frames.length)
})
const isConnectionFilteredByType = computed(() => {
  const typeIds = globalStore.filteredConnectionTypeIds
  return typeIds.includes(connectionTypeId.value)
})
const isCardsFilteredByFrame = computed(() => {
  const frameIds = globalStore.filteredFrameIds
  const cards = cardStore.getAllCards
  const startItemId = props.connection.startItemId
  const endItemId = props.connection.endItemId
  const startCard = cards.filter(card => card.id === startItemId)[0]
  const endCard = cards.filter(card => card.id === endItemId)[0]
  const startCardInFilter = frameIds.includes(startCard.frameId)
  const endCardInFilter = frameIds.includes(endCard.frameId)
  return startCardInFilter || endCardInFilter
})
const isFiltered = computed(() => {
  if (filtersIsActive.value) {
    const isInFilter = isCardsFilteredByFrame.value || isConnectionFilteredByType.value
    if (isInFilter) {
      return false
    } else {
      return true
    }
  } else { return false }
})
const isHiddenByCommentFilter = computed(() => {
  const filterCommentsIsActive = userStore.filterComments
  if (!filterCommentsIsActive) { return }
  const startItem = items.value.startItem
  const endItem = items.value.endItem
  if (!startItem || !endItem) { return }
  const startItemIsComment = startItem.isComment || utils.isNameComment(startItem.name)
  const endItemIsComment = startItem.isComment || utils.isNameComment(endItem.name)
  return startItemIsComment || endItemIsComment
})

// parent connection type

const connectionTypeId = computed(() => props.connection.connectionTypeId)
const connectionType = computed(() => connectionStore.getConnectionType(connectionTypeId.value))
const typeName = computed(() => {
  if (connectionType.value) {
    return connectionType.value.name
  } else {
    return ''
  }
})
const typeColor = computed(() => {
  if (connectionType.value) {
    return connectionType.value.color
  } else {
    return 'transparent'
  }
})
const updateTypeColorCSS = () => {
  utils.setCssVariable('type-color', typeColor.value)
}

// label wrap

const path = computed(() => props.connection.path)
watch(() => path.value, (value, prevValue) => {
  updateConnectionRect()
})
const updateConnectionRect = () => {
  if (!props.connection.labelIsVisible) { return }
  const element = document.querySelector(`.connection-path[data-id="${id.value}"]`)
  let rect
  if (element) {
    rect = utils.rectFromConnectionPath(element.getAttribute('d'))
  } else {
    // compute position from path if element isn't rendered yet
    rect = utils.rectFromConnectionPath(path.value)
  }
  state.connectionRect = rect
}
const connectionLabelWrapStyles = computed(() => {
  if (!state.connectionRect) { return }
  return {
    left: state.connectionRect.x + 'px',
    top: state.connectionRect.y + 'px',
    width: state.connectionRect.width + 'px',
    height: state.connectionRect.height + 'px'
  }
})

// label position

const labelRelativePosition = computed(() => {
  return {
    x: props.connection.labelRelativePositionX || 0.5,
    y: props.connection.labelRelativePositionY || 0.5
  }
})
const styles = computed(() => {
  const label = labelElement.value
  if (!label) { return }
  let labelRect = label.getBoundingClientRect()
  labelRect = utils.rectDimensions(labelRect)
  const labelCenter = {
    x: Math.round(labelRect.width / 2),
    y: Math.round(labelRect.height / 2)
  }
  const styles = {
    background: typeColor.value,
    left: `calc(${labelRelativePosition.value.x * 100}% - ${labelCenter.x}px)`,
    top: `calc(${labelRelativePosition.value.y * 100}% - ${labelCenter.y}px)`
  }
  if (remoteUserDragging.value) {
    styles.background = remoteUserDragging.value.userColor
  }
  return styles
})
const removeOffsets = () => {
  connectionStore.clearConnectionLabelPosition(props.connection.id)
  stopDragging()
  wasDragged = false
}
const shouldJiggle = computed(() => {
  return state.isDragging || remoteUserDragging.value
})
const normalizeRelativePosition = (positionRelative) => {
  const max = 1
  const min = 0
  positionRelative = {
    x: Math.max(min, positionRelative.x),
    y: Math.max(min, positionRelative.y)
  }
  positionRelative = {
    x: Math.min(max, positionRelative.x),
    y: Math.min(max, positionRelative.y)
  }
  return positionRelative
}

// label dragging

const startDragging = (event) => {
  if (!canEditSpace.value) { return }
  globalStore.closeAllDialogs()
  globalStore.clearMultipleSelected()
  updateTypeColorCSS()
  state.isDragging = true
  wasDragged = false
  const updates = {
    userId: userStore.id,
    userColor: userStore.color,
    connectionId: props.connection.id
  }
  broadcastStore.update({ updates, action: 'updateRemoteUserDraggingConnectionLabel' })
  // save start positions
  if (!cursorStart.x) {
    cursorStart = utils.cursorPositionInSpace(event)
    positionAbsoluteStart = {
      x: Math.round(labelRelativePosition.value.x * state.connectionRect.width),
      y: Math.round(labelRelativePosition.value.y * state.connectionRect.height)
    }
    prevLabelRelativePosition = labelRelativePosition.value
  }
}
const stopDragging = () => {
  if (!canEditSpace.value) { return }
  if (!state.isDragging) { return }
  state.isDragging = false
  state.outOfBounds = {}
  cursorStart = {}
  broadcastStore.update({ updates: { userId: userStore.id }, action: 'removeRemoteUserDraggingConnectionLabel' })
}
const drag = (event) => {
  if (!canEditSpace.value) { return }
  if (!state.isDragging) { return }
  if (isMultiTouch) { return }
  state.currentCursor = utils.cursorPositionInSpace(event)
  const cursorDelta = {
    x: state.currentCursor.x - cursorStart.x,
    y: state.currentCursor.y - cursorStart.y
  }
  wasDragged = true
  const positionAbsolute = {
    x: cursorDelta.x + positionAbsoluteStart?.x,
    y: cursorDelta.y + positionAbsoluteStart?.y
  }
  let positionRelative = {
    x: positionAbsolute.x / state.connectionRect.width,
    y: positionAbsolute.y / state.connectionRect.height
  }
  positionRelative = normalizeRelativePosition(positionRelative)
  connectionStore.updateConnectionLabelPosition({
    id: props.connection.id,
    labelRelativePositionX: positionRelative.x,
    labelRelativePositionY: positionRelative.y
  })
}
const remoteUserDragging = computed(() => {
  const remoteUserDraggingConnectionLabel = globalStore.remoteUserDraggingConnectionLabel
  if (!remoteUserDraggingConnectionLabel.length) { return }
  const update = remoteUserDraggingConnectionLabel.find(update => update.connectionId.includes(props.connection.id))
  return update
})

// touch dragging

const lockingFrameStyle = computed(() => {
  const initialPadding = 65 // matches initialLockCircleRadius in paintSelect
  const initialBorderRadius = 50
  const padding = initialPadding * state.lockingPercent
  const borderRadius = Math.max((state.lockingPercent * initialBorderRadius), 5) + 'px'
  const size = `calc(100% + ${padding}px)`
  const position = -(padding / 2) + 'px'
  return {
    width: size,
    height: size,
    left: position,
    top: position,
    background: userStore.color,
    opacity: state.lockingAlpha,
    borderRadius
  }
})
const cancelLocking = () => {
  shouldCancelLocking = true
}
const cancelLockingAnimationFrame = () => {
  state.isLocking = false
  state.lockingPercent = 0
  state.lockingAlpha = 0
  shouldCancelLocking = false
}
const startLocking = (event) => {
  console.info('startLocking', event)
  updateTouchPosition(event)
  updateCurrentTouchPosition(event)
  state.isLocking = true
  shouldCancelLocking = false
  setTimeout(() => {
    if (!lockingAnimationTimer) {
      lockingAnimationTimer = window.requestAnimationFrame(lockingAnimationFrame)
    }
  }, lockingPreDuration)
}
const lockingAnimationFrame = (timestamp) => {
  if (!lockingStartTime) {
    lockingStartTime = timestamp
  }
  const elaspedTime = timestamp - lockingStartTime
  const percentComplete = (elaspedTime / lockingDuration) // between 0 and 1
  if (!utils.cursorsAreClose(touchPosition, currentTouchPosition)) {
    notifyPressAndHoldToDrag()
    cancelLockingAnimationFrame()
  }
  if (shouldCancelLocking) {
    cancelLockingAnimationFrame()
  }
  if (state.isLocking && percentComplete <= 1) {
    const percentRemaining = Math.abs(percentComplete - 1)
    state.lockingPercent = percentRemaining
    const alpha = utils.easeOut(percentComplete, elaspedTime, lockingDuration)
    state.lockingAlpha = alpha
    window.requestAnimationFrame(lockingAnimationFrame)
  } else if (state.isLocking && percentComplete > 1) {
    console.info('🔒🐢 label lockingAnimationFrame locked')
    lockingAnimationTimer = undefined
    lockingStartTime = undefined
    state.isLocking = false
    startDragging(initialTouchEvent)
  } else {
    window.cancelAnimationFrame(lockingAnimationTimer)
    lockingAnimationTimer = undefined
    lockingStartTime = undefined
    cancelLockingAnimationFrame()
  }
}
const notifyPressAndHoldToDrag = () => {
  const hasNotified = globalStore.hasNotifiedPressAndHoldToDrag
  if (!hasNotified) {
    globalStore.addNotification({ message: 'Press and hold to drag', icon: 'press-and-hold' })
  }
  globalStore.hasNotifiedPressAndHoldToDrag = true
}
const updateTouchPosition = (event) => {
  initialTouchEvent = event
  checkIsMultiTouch(event)
  touchPosition = utils.cursorPositionInViewport(event)
}
const touchIsNearTouchPosition = (event) => {
  const currentPosition = utils.cursorPositionInViewport(event)
  const touchBlur = 12
  const isTouchX = utils.isBetween({
    value: currentPosition.x,
    min: touchPosition.x - touchBlur,
    max: touchPosition.x + touchBlur
  })
  const isTouchY = utils.isBetween({
    value: currentPosition.y,
    min: touchPosition.y - touchBlur,
    max: touchPosition.y + touchBlur
  })
  if (isTouchX && isTouchY) {
    return true
  }
}
const updateCurrentTouchPosition = (event) => {
  currentTouchPosition = utils.cursorPositionInViewport(event)
  if (state.isDragging) {
    event.preventDefault() // allows dragging without scrolling
  }
}
const endInteractionTouch = (event) => {
  cancelLocking()
  if (touchIsNearTouchPosition(event)) {
    toggleConnectionDetails(event)
  }
  stopDragging()
}
// boundaries

const boundaryIsVisible = computed(() => {
  return boundaryLeftIsVisible.value || boundaryRightIsVisible.value || boundaryTopIsVisible.value || boundaryBottomIsVisible.value
})
const boundaryLeftIsVisible = computed(() => labelRelativePosition.value.x <= 0)
const boundaryRightIsVisible = computed(() => labelRelativePosition.value.x >= 1)
const boundaryTopIsVisible = computed(() => labelRelativePosition.value.y <= 0)
const boundaryBottomIsVisible = computed(() => labelRelativePosition.value.y >= 1)
</script>

<template lang="pug">
.connection-label-wrap(
  v-if="visible"
  :style="connectionLabelWrapStyles"
  :class="{'is-hidden-by-opacity': isHiddenByCommentFilter}"
  :data-is-hidden-by-comment-filter="isHiddenByCommentFilter"
)
  .connection-label.badge(
    :data-id="id"
    :data-label-offset-x="labelRelativePosition.x"
    :data-label-offset-y="labelRelativePosition.y"
    :style="styles"

    @mousedown.left.prevent="startDragging"
    @mouseup.left="toggleConnectionDetails"
    @dblclick="removeOffsets"

    @touchstart="startLocking"
    @touchmove="updateCurrentTouchPosition"
    @touchend="endInteractionTouch"

    @mouseover.left="state.hover = true"
    @mouseleave.left="state.hover = false"
    :class="{filtered: isFiltered, active: connectionDetailsIsVisible, jiggle: shouldJiggle}"
    ref="labelElement"
  )
    span.name(:class="{ 'is-dark': isDark }") {{typeName}}
    .locking-frame(v-if="state.isLocking" :style="lockingFrameStyle")
  template(v-if="boundaryIsVisible && state.isDragging")
    .connection-label-boundary.left(v-if="boundaryLeftIsVisible")
    .connection-label-boundary.right(v-if="boundaryRightIsVisible")
    .connection-label-boundary.top(v-if="boundaryTopIsVisible")
    .connection-label-boundary.bottom(v-if="boundaryBottomIsVisible")
</template>

<style lang="stylus">
.connection-label-wrap
  position absolute
.connection-label
  pointer-events all
  cursor pointer
  position absolute
  z-index 1
  width max-content
  &:hover
    box-shadow var(--hover-shadow)
  &:active,
  &.active
    box-shadow var(--button-active-inset-shadow)

  &.cursor-default
    cursor default
  .name
    color var(--primary-on-light-background)
    &.is-dark
      color var(--primary-on-dark-background)

.locking-frame
  position absolute
  z-index -1
  pointer-events none

--type-color white
.connection-label-boundary
  position absolute
  box-shadow 0 0 10px 3px var(--type-color)
  &.left
    left 0
    top 0
    width 0
    height 100%
    animation boundaryLeft 0.3s infinite ease-out alternate
  &.right
    right -5px
    top 0
    width 0
    height 100%
    animation boundaryRight 0.3s infinite ease-out alternate
  &.top
    left 0
    top 0
    width 100%
    height 0
    animation boundaryTop 0.3s infinite ease-out alternate
  &.bottom
    left 0
    bottom -5px
    width 100%
    height 0
    animation boundaryBottom 0.3s infinite ease-out alternate

@keyframes boundaryLeft
  from
    transform translateX(0)
  to
    transform translateX(-4px)
@keyframes boundaryRight
  from
    transform translateX(0)
  to
    transform translateX(4px)
@keyframes boundaryTop
  from
    transform translateY(0)
  to
    transform translateY(4px)
@keyframes boundaryBottom
  from
    transform translateY(0)
  to
    transform translateY(-4px)
</style>
