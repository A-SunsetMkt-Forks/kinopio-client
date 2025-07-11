<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'
import { useApiStore } from '@/stores/useApiStore'
import { useBroadcastStore } from '@/stores/useBroadcastStore'

import utils from '@/utils.js'
import consts from '@/consts.js'
import cache from '@/cache.js'

import { nanoid } from 'nanoid'

const globalStore = useGlobalStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()
const apiStore = useApiStore()
const broadcastStore = useBroadcastStore()

const canvasElement = ref(null)
let canvas, context
let isDrawing = false
let currentStroke = []
let currentStrokeId = ''
let spaceStrokes = []
let remoteStrokes = []
let redoStrokes = []
const newStrokes = []

let unsubscribes

onMounted(() => {
  window.addEventListener('pointerup', endDrawing)
  window.addEventListener('mouseup', endDrawing)
  window.addEventListener('touchend', endDrawing)
  window.addEventListener('scroll', scroll)
  window.addEventListener('resize', resize)
  canvas = canvasElement.value
  context = canvas.getContext('2d')
  context.scale(window.devicePixelRatio, window.devicePixelRatio)
  updatePrevScroll()
  clearCanvas()
  clearDrawing()
  const globalActionUnsubscribe = globalStore.$onAction(
    async ({ name, args }) => {
      if (name === 'triggerStartDrawing') {
        startDrawing(args[0])
      } else if (name === 'triggerDraw') {
        draw(args[0])
      } else if (name === 'triggerAddRemoteDrawingStroke') {
        const stroke = args[0]
        remoteStrokes.push(stroke)
        renderStroke(stroke, true)
        globalStore.triggerUpdateDrawingBackground()
      } else if (name === 'triggerRemoveRemoteDrawingStroke') {
        const stroke = args[0].stroke
        remoteStrokes = remoteStrokes.filter(points => {
          return points[0].id !== stroke[0].id
        })
        redrawStrokes()
      } else if (name === 'triggerDrawingUndo') {
        undo()
      } else if (name === 'triggerDrawingRedo') {
        redo()
      } else if (name === 'triggerDrawingInitialize') {
        // perf: save spaceStore.drawingStrokes to var, and clear state
        spaceStrokes = utils.clone(spaceStore.drawingStrokes)
        spaceStrokes.reverse()
        spaceStore.drawingStrokes = []
        redrawStrokes()
        await updateDrawingDataUrl()
      } else if (name === 'triggerDrawingReset') {
        clearDrawing()
      } else if (name === 'triggetUpdateDrawingDataUrl') {
        await updateDrawingDataUrl()
        globalStore.triggerEndDrawing()
      }
    }
  )
  const spaceActionUnsubscribe = spaceStore.$onAction(
    ({ name, args }) => {
      const actions = ['loadSpace', 'changeSpace', 'createSpace']
      if (actions.includes(name)) {
        clearDrawing()
      }
    }
  )
  unsubscribes = () => {
    globalActionUnsubscribe()
    spaceActionUnsubscribe()
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerup', endDrawing)
  window.removeEventListener('mouseup', endDrawing)
  window.removeEventListener('touchend', endDrawing)
  window.removeEventListener('scroll', scroll)
  window.removeEventListener('resize', resize)
  unsubscribes()
})

watch(() => globalStore.currentUserToolbar, async (value, prevValue) => {
  updatePrevScroll()
  redrawStrokes()
})
watch(
  [
    () => globalStore.spaceZoomPercent,
    () => globalStore.zoomOrigin
  ],
  async () => {
    await nextTick()
    scroll()
  }
)

const state = reactive({
  prevScroll: { x: 0, y: 0 }
})

const viewportHeight = computed(() => globalStore.viewportHeight)
const viewportWidth = computed(() => globalStore.viewportWidth)
const pageHeight = computed(() => globalStore.pageHeight)
const pageWidth = computed(() => globalStore.pageWidth)
const currentUserIsSignedIn = computed(() => userStore.getUserIsSignedIn)
const toolbarIsDrawing = computed(() => globalStore.getToolbarIsDrawing)

// clear

const clearCanvas = () => {
  context.clearRect(0, 0, canvas.width, canvas.height)
}
const clearDrawing = () => {
  globalStore.drawingImageUrl = ''
  globalStore.drawingStrokeColors = []
  globalStore.drawingEraserIsActive = false
  redoStrokes = []
  spaceStrokes = []
  remoteStrokes = []
  clearCanvas()
}

// points

const strokeColor = computed(() => userStore.getUserDrawingColor)
const strokeDiameter = computed(() => {
  const diameter = userStore.drawingBrushSize
  return consts.drawingBrushSizeDiameter[diameter]
})
const createPoint = (event) => {
  const { x, y } = utils.cursorPositionInSpace(event)
  return {
    id: currentStrokeId,
    x,
    y,
    color: strokeColor.value,
    diameter: strokeDiameter.value,
    isEraser: globalStore.drawingEraserIsActive
  }
}

// broadcast

const broadcastAddStroke = (stroke, shouldPreventBroadcast) => {
  if (shouldPreventBroadcast) { return }
  broadcastStore.update({
    updates: stroke,
    action: 'triggerAddRemoteDrawingStroke'
  })
}
const broadcastRemoveStroke = (stroke, shouldPreventBroadcast) => {
  if (shouldPreventBroadcast) { return }
  broadcastStore.update({
    updates: stroke,
    action: 'triggerRemoveRemoteDrawingStroke'
  })
}

// render

const viewportPosition = (point) => {
  return {
    x: point.x - state.prevScroll.x,
    y: point.y - state.prevScroll.y
  }
}
const renderPoint = (point, shouldPreventBroadcast) => {
  context.lineCap = context.lineJoin = 'round'
  const { x, y } = viewportPosition(point)
  context.globalCompositeOperation = 'source-over'
  if (point.isEraser) {
    context.globalCompositeOperation = 'destination-out'
  }
  const radius = point.diameter / 2
  context.beginPath()
  context.arc(x, y, radius, 0, 2 * Math.PI)
  context.closePath()
  context.fillStyle = point.color
  context.fill()
  broadcastAddStroke([point], shouldPreventBroadcast)
}
const renderStroke = (stroke, shouldPreventBroadcast) => {
  context.lineCap = context.lineJoin = 'round'
  if (stroke.length === 1) {
    renderPoint(stroke[0], shouldPreventBroadcast)
    return
  }
  const { x: x0, y: y0 } = viewportPosition(stroke[0])
  context.globalCompositeOperation = 'source-over'
  if (stroke[0].isEraser) {
    context.globalCompositeOperation = 'destination-out'
  }
  context.strokeStyle = stroke[0].color
  context.lineWidth = stroke[0].diameter
  context.beginPath()
  context.moveTo(x0, y0)
  stroke.forEach((point) => {
    const { x, y } = viewportPosition(point)
    context.lineTo(x, y)
  })
  context.stroke()
  broadcastAddStroke(stroke, shouldPreventBroadcast)
}
const dataUrlFromOffscreenCanvas = (offscreenCanvas) => {
  return new Promise((resolve, reject) => {
    offscreenCanvas.convertToBlob()
      .then(blob => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
      .catch(reject)
  })
}
const updateDrawingDataUrl = async () => {
  const strokes = allStrokes()
  const offscreenCanvas = new OffscreenCanvas(pageWidth.value, pageHeight.value)
  const offscreenContext = offscreenCanvas.getContext('2d')
  offscreenContext.clearRect(0, 0, pageWidth.value, pageHeight.value)
  // render strokes
  strokes.forEach(stroke => {
    if (!stroke || stroke.length === 0) { return }
    stroke.forEach((point, index) => {
      offscreenContext.globalCompositeOperation = 'source-over'
      if (point.isEraser) {
        offscreenContext.globalCompositeOperation = 'destination-out'
      }
      if (index === 0) {
        offscreenContext.beginPath()
        offscreenContext.moveTo(point.x, point.y)
        return
      }
      offscreenContext.lineTo(point.x, point.y)
      offscreenContext.strokeStyle = point.color
      offscreenContext.lineWidth = point.diameter
      offscreenContext.lineCap = 'round'
      offscreenContext.lineJoin = 'round'
      offscreenContext.stroke()
      offscreenContext.moveTo(point.x, point.y)
    })
  })
  const dataUrl = await dataUrlFromOffscreenCanvas(offscreenCanvas)
  globalStore.drawingImageUrl = dataUrl
  broadcastStore.update({
    action: 'triggetUpdateDrawingDataUrl'
  })
}

// start

const startDrawing = (event) => {
  if (!toolbarIsDrawing.value) { return }
  globalStore.closeAllDialogs()
  isDrawing = true
  currentStrokeId = nanoid()
  currentStroke = []
  const point = createPoint(event)
  renderStroke([point])
  currentStroke.push(point)
  globalStore.triggerUpdateDrawingBackground()
}

// draw

const allStrokes = () => {
  return spaceStrokes.concat(newStrokes).concat(remoteStrokes)
}
const draw = (event) => {
  if (utils.isMultiTouch(event)) { return }
  if (!isDrawing) { return }
  currentStroke.push(createPoint(event))
  renderStroke(currentStroke)
  globalStore.triggerUpdateDrawingBackground()
}
const redrawStrokes = async () => {
  clearCanvas()
  context.globalCompositeOperation = 'source-over'
  spaceStrokes.forEach(stroke => {
    renderStroke(stroke, true)
  })
  remoteStrokes.forEach(stroke => {
    renderStroke(stroke, true)
  })
  globalStore.triggerUpdateDrawingBackground()
  updatePageSizes()
}

// stop

const saveStroke = async ({ stroke, isRemovedStroke }) => {
  const strokes = allStrokes()
  console.log(strokes)
  await updateDrawingDataUrl()
  globalStore.triggerEndDrawing()
  updatePageSizes()
  if (isRemovedStroke) {
    await apiStore.addToQueue({ name: 'removeDrawingStroke', body: { stroke } })
  } else {
    await apiStore.addToQueue({ name: 'createDrawingStroke', body: { stroke } })
  }
  await cache.updateSpace('drawingStrokes', strokes, spaceStore.id)
}
const endDrawing = async (event) => {
  if (!toolbarIsDrawing.value) { return }
  if (!currentStroke.length) {
    isDrawing = false
    return
  }
  globalStore.addToDrawingStrokeColors(currentStroke[0].color)
  spaceStrokes.push(currentStroke)
  saveStroke({ stroke: currentStroke })
  currentStroke = []
  redoStrokes = []
  isDrawing = false
}

// undo redo

const undo = () => {
  const strokes = spaceStrokes.concat(newStrokes)
  const prevStroke = strokes.pop() // remove last stroke
  redoStrokes.push(prevStroke) // append to redo stack
  redrawStrokes()
  saveStroke({ stroke: prevStroke, isRemovedStroke: true })
  broadcastRemoveStroke(prevStroke)
}
const redo = () => {
  if (!redoStrokes.length) { return }
  const prevStroke = redoStrokes.pop()
  spaceStrokes.push(prevStroke)
  redrawStrokes()
  saveStroke({ stroke: prevStroke })
  broadcastAddStroke(prevStroke)
}

// scroll and resize

const updatePrevScroll = () => {
  const zoom = globalStore.getSpaceZoomDecimal
  state.prevScroll = {
    x: window.scrollX * zoom,
    y: window.scrollY * zoom
  }
}
const scroll = () => {
  updatePrevScroll()
  redrawStrokes() // todo redraw from drawingImageUrl
}
const resize = async () => {
  await nextTick()
  await nextTick()
  setTimeout(() => {
    scroll()
  }, 10)
}
const updatePageSizes = () => {
  const strokes = allStrokes()
  let x = 0
  let y = 0
  const drawingBrushSizeDiameter = consts.drawingBrushSizeDiameter.l // 40
  strokes.forEach(points => {
    points.forEach(point => {
      if (point.x > x) {
        x = point.x
      }
      if (point.y > y) {
        y = point.y
      }
    })
  })
  const padding = {
    width: globalStore.viewportWidth / 2,
    height: globalStore.viewportHeight / 2
  }
  const rect = {
    width: x + drawingBrushSizeDiameter + padding.width,
    height: y + drawingBrushSizeDiameter + padding.height
  }
  globalStore.updatePageSizesFromRect(rect)
}

const styles = computed(() => {
  const value = {
    top: state.prevScroll.y + 'px',
    left: state.prevScroll.x + 'px'
  }
  return value
})

const spaceWidth = computed(() => globalStore.viewportWidth * globalStore.getSpaceCounterZoomDecimal)
const spaceHeight = computed(() => globalStore.viewportHeight * globalStore.getSpaceCounterZoomDecimal)

</script>

<template lang="pug">
canvas#drawing-canvas.drawing-canvas(
  ref="canvasElement"
  :width="spaceWidth"
  :height="spaceHeight"
  :style="styles"
)
</template>

<style lang="stylus">
canvas.drawing-canvas
  position absolute
  transform-origin top left
  background transparent
  top 0
  left 0
  opacity 1
  pointer-events none
  z-index var(--max-z) // because card z
  mix-blend-mode hard-light
</style>
