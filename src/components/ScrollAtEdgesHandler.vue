<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useCardStore } from '@/stores/useCardStore'
import { useBoxStore } from '@/stores/useBoxStore'

import utils from '@/utils.js'

const globalStore = useGlobalStore()
const cardStore = useCardStore()
const boxStore = useBoxStore()

let unsubscribes
const threshold = 50
let startCursor, prevCursor, prevCursorPage, endCursor, scrollTimer, maxHeight, maxWidth, currentEvent
let movementDirection = {}

onMounted(() => {
  window.addEventListener('mousedown', initInteractions)
  window.addEventListener('touchstart', initInteractions)
  // bind events to window to receive events when mouse is outside window
  window.addEventListener('mousemove', interact)
  window.addEventListener('touchmove', interact)
  window.addEventListener('mouseup', stopInteractions)
  window.addEventListener('touchend', stopInteractions)

  const globalActionUnsubscribe = globalStore.$onAction(
    ({ name, args }) => {
      if (name === 'triggeredTouchCardDragPosition') {
        const position = globalStore.triggeredTouchCardDragPosition
        const event = {
          clientX: position.x,
          clientY: position.y
        }
        stopScrollTimer()
        initInteractions(event)
      }
    }
  )
  unsubscribes = () => {
    globalActionUnsubscribe()
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('mousedown', initInteractions)
  window.removeEventListener('touchstart', initInteractions)
  window.removeEventListener('mousemove', interact)
  window.removeEventListener('touchmove', interact)
  window.removeEventListener('mouseup', stopInteractions)
  window.removeEventListener('touchend', stopInteractions)
  unsubscribes()
})

watch(() => globalStore.currentUserIsPaintingLocked, (value, prevValue) => {
  if (value) {
    stopScrollTimer()
  }
})

// interacting

const initInteractions = (event) => {
  currentEvent = event
  const shouldScrollAtEdges = globalStore.getShouldScrollAtEdges(event)
  const position = utils.cursorPositionInViewport(event)
  const zoom = spaceZoomDecimal.value
  startCursor = position
  endCursor = position
  maxHeight = Math.max(6500, globalStore.viewportHeight) * zoom
  maxWidth = Math.max(6500, globalStore.viewportWidth) * zoom
  if (shouldScrollAtEdges) {
    updateMovementDirection()
  }
  if (shouldScrollAtEdges && !scrollTimer) {
    scrollTimer = window.requestAnimationFrame(scrollFrame)
  }
}
const interact = (event) => {
  currentEvent = event
  const isLeftMouseButtonDown = event.buttons === 1
  const isTouch = Boolean(event.touches)
  const isInteracting = isLeftMouseButtonDown || isTouch
  if (!isInteracting) { return }
  const shouldScrollAtEdges = globalStore.getShouldScrollAtEdges(event)
  if (shouldScrollAtEdges) {
    updateMovementDirection()
  }
  prevCursor = utils.cursorPositionInViewport(event)
  prevCursorPage = utils.cursorPositionInPage(event)
  if (shouldScrollAtEdges && !scrollTimer) {
    scrollTimer = window.requestAnimationFrame(scrollFrame)
  }
}
const stopScrollTimer = () => {
  window.cancelAnimationFrame(scrollTimer)
  scrollTimer = undefined
  prevCursor = undefined
  movementDirection = {}
}
const stopInteractions = () => {
  stopScrollTimer()
}

// user

const currentUserIsPainting = computed(() => globalStore.currentUserIsPainting)
const isDraggingCard = computed(() => globalStore.currentUserIsDraggingCard)
const isDrawingConnection = computed(() => globalStore.currentUserIsDrawingConnection)
const isResizingCard = computed(() => globalStore.currentUserIsResizingCard)

// position

const cursor = () => {
  if (utils.objectHasKeys(prevCursor)) {
    return prevCursor
  } else {
    return startCursor
  }
}
const viewportHeight = computed(() => globalStore.viewportHeight)
const viewportWidth = computed(() => globalStore.viewportWidth)
const pageHeight = computed(() => globalStore.pageHeight)
const pageWidth = computed(() => globalStore.pageWidth)
const spaceCounterZoomDecimal = computed(() => globalStore.getSpaceCounterZoomDecimal)
const spaceZoomDecimal = computed(() => globalStore.getSpaceZoomDecimal)
const shouldPreventResize = computed(() => currentUserIsPainting.value || isDrawingConnection.value || isResizingCard.value)

// scroll

const scrollFrame = () => {
  let delta, currentSpeed
  const currentCursor = cursor()
  const cursorIsTopSide = currentCursor.y <= threshold
  const cursorIsBottomSide = currentCursor.y >= (viewportHeight.value - threshold)
  const cursorIsLeftSide = currentCursor.x <= threshold
  const cursorIsRightSide = currentCursor.x >= (viewportWidth.value - threshold)
  const shouldScrollUp = Boolean(cursorIsTopSide && window.scrollY)
  // Y movement
  if (movementDirection.y === 'up' && shouldScrollUp) {
    currentSpeed = scrollSpeed(currentCursor, 'up')
    delta = {
      x: 0,
      y: -currentSpeed
    }
    scrollBy(delta)
  } else if (movementDirection.y === 'down' && cursorIsBottomSide && shouldScrollDown()) {
    currentSpeed = scrollSpeed(currentCursor, 'down')
    delta = {
      x: 0,
      y: currentSpeed
    }
    increasePageHeight(delta)
    scrollBy(delta)
  }
  // X movement
  if (movementDirection.x === 'left' && cursorIsLeftSide && window.scrollX) {
    currentSpeed = scrollSpeed(currentCursor, 'left')
    delta = {
      x: -currentSpeed,
      y: 0
    }
    scrollBy(delta)
  } else if (movementDirection.x === 'right' && cursorIsRightSide && shouldScrollRight()) {
    currentSpeed = scrollSpeed(currentCursor, 'right')
    delta = {
      x: currentSpeed,
      y: 0
    }
    increasePageWidth(delta)
    scrollBy(delta)
  }
  if (scrollTimer) {
    window.requestAnimationFrame(scrollFrame)
  }
}
const updateMovementDirection = () => {
  const frameCursor = cursor()
  const xMove = endCursor.x - frameCursor.x
  const yMove = endCursor.y - frameCursor.y
  if (Math.sign(yMove) === 1) {
    movementDirection.y = 'up'
  } else if (Math.sign(yMove) === -1) {
    movementDirection.y = 'down'
  }
  if (Math.sign(xMove) === 1) {
    movementDirection.x = 'left'
  } else if (Math.sign(xMove) === -1) {
    movementDirection.x = 'right'
  }
}
const shouldScrollRight = () => {
  const scrolledTooFarRight = (window.scrollX + viewportWidth.value) > maxWidth
  return !scrolledTooFarRight
}
const shouldScrollDown = () => {
  const scrolledTooFarDown = (window.scrollY + viewportHeight.value) > maxHeight
  return !scrolledTooFarDown
}
const scrollSpeed = (cursor, direction) => {
  const minSpeed = 10
  const maxSpeed = 20
  const maxSpeedOutsideWindow = 50
  // viewportSize based on direction
  const directionIsY = direction === 'up' || direction === 'down'
  const directionIsX = direction === 'left' || direction === 'right'
  let viewportSize
  if (directionIsX) {
    cursor = cursor.x
    viewportSize = viewportWidth.value
  } else if (directionIsY) {
    cursor = cursor.y
    viewportSize = viewportHeight.value
  }
  // calc percent over threshold
  let amount
  if (direction === 'up' || direction === 'left') {
    amount = Math.abs(cursor - threshold)
  }
  if (direction === 'down' || direction === 'right') {
    amount = Math.abs(cursor - (viewportSize - threshold))
  }
  const percent = utils.roundFloat(amount / threshold)
  // speed
  let speed = percent * threshold
  speed = Math.max(speed, minSpeed)
  if (percent > 1) {
    speed = Math.min(speed, maxSpeedOutsideWindow)
  } else {
    speed = Math.min(speed, maxSpeed)
  }
  return speed
}
const scrollBy = (delta) => {
  if (utils.isAndroid()) { return }
  let zoom = spaceZoomDecimal.value
  if (zoom === 1) {
    const viewport = utils.visualViewport()
    zoom = viewport.scale
  }
  const currentUserIsBoxSelecting = globalStore.currentUserIsBoxSelecting
  const isDraggingCard = globalStore.currentUserIsDraggingCard
  const isDraggingBox = globalStore.currentUserIsDraggingBox
  const isDraggingItem = isDraggingCard || isDraggingBox
  delta = {
    left: Math.round(delta.x * zoom),
    top: Math.round(delta.y * zoom)
  }
  if (isDraggingItem) {
    const slowMultiplier = 0.9
    const itemDelta = {
      x: delta.left * slowMultiplier,
      y: delta.top * slowMultiplier
    }
    if (isDraggingCard || isDraggingBox) {
      cardStore.moveCards({ endCursor, prevCursor, delta: itemDelta })
      boxStore.moveBoxes({ endCursor, prevCursor, delta: itemDelta })
    }
  }
  if (isDrawingConnection.value) {
    globalStore.triggerDrawConnectionFrame(currentEvent)
  }
  if (currentUserIsPainting.value && !currentUserIsBoxSelecting) {
    globalStore.triggerPaintFramePosition(currentEvent)
  }
  window.scrollBy(delta)
}

// page size

const increasePageWidth = (delta) => {
  if (shouldPreventResize.value) { return }
  const cursorIsRightSideOfPage = (pageWidth.value - prevCursorPage.x) < threshold
  if (cursorIsRightSideOfPage) {
    const width = pageWidth.value + delta.x
    globalStore.pageWidth = width
  }
}
const increasePageHeight = (delta) => {
  if (shouldPreventResize.value) { return }
  const cursorIsBottomSideOfPage = (pageHeight.value - prevCursorPage.y) < threshold
  if (cursorIsBottomSideOfPage) {
    const height = pageHeight.value + delta.y
    globalStore.pageHeight = height
  }
}

</script>

<template lang="pug">
</template>
