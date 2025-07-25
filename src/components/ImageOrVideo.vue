<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'

import utils from '@/utils.js'
import consts from '@/consts.js'

const globalStore = useGlobalStore()

const videoElement = ref(null)
const imageElement = ref(null)

onMounted(() => {
  state.imageUrl = imgproxyUrl(props.image, props.width, props.height)
  window.addEventListener('mousemove', updateCanvasSelectedClass)
  window.addEventListener('touchmove', updateCanvasSelectedClass)
})
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', updateCanvasSelectedClass)
  window.removeEventListener('touchmove', updateCanvasSelectedClass)
})

const emit = defineEmits(['loadSuccess'])

const props = defineProps({
  isSelectedOrDragging: Boolean,
  pendingUploadDataUrl: String,
  image: String,
  video: String,
  cardId: String,
  width: Number,
  height: Number
})
watch(() => props.image, (url) => {
  if (!url && !props.pendingUploadDataUrl) {
    state.imageUrl = null
    state.imageProxySrcSet = null
  }
  const onLoaded = () => {
    state.imageUrl = imgproxyUrl(url, props.width, props.height)
  }
  const image = new Image()
  image.addEventListener('load', onLoaded)
  image.addEventListener('error', handleError)
  image.src = url
  if (image.complete) {
    onLoaded()
  }
})
watch(() => props.pendingUploadDataUrl, (url) => {
  if (url) {
    state.imageUrl = url
  }
})
watch(() => props.width, (width) => {
  state.imageUrl = imgproxyUrl(props.image, props.width, props.height)
})
watch(() => props.height, (height) => {
  state.imageUrl = imgproxyUrl(props.image, props.width, props.height)
})

const state = reactive({
  imageUrl: null,
  imageProxySrcSet: null
})

const isTouching = computed(() => globalStore.isPinchZooming || globalStore.isTouchScrolling)
const isInteracting = computed(() => {
  const isInteractingWithItem = globalStore.getIsInteractingWithItem
  const isPainting = globalStore.currentUserIsPainting
  const isPanning = globalStore.currentUserIsPanningReady
  const isDrawing = globalStore.currentUserIsDrawing
  return isInteractingWithItem || isPainting || isPanning || isDrawing
})
watch(() => isInteracting.value, (value) => {
  if (value) {
    pause()
  } else {
    play()
  }
})
watch(() => isTouching.value, (value) => {
  if (value) {
    pause()
  } else {
    play()
  }
})
const pause = () => {
  pauseVideo()
  pauseGif()
}
const play = () => {
  playVideo()
  playGif()
}

watch(() => globalStore.multipleSelectedActionsIsVisible, (value) => {
  if (value) { return }
  removeCanvasSelectedClass()
})

// video

const pauseVideo = () => {
  if (!props.video) { return }
  const element = videoElement.value
  element.pause()
}
const playVideo = () => {
  if (!props.video) { return }
  const element = videoElement.value
  element.play()
}

// gif

const imageIsGif = computed(() => {
  const url = state.imageUrl
  if (!url) { return }
  return url.includes('.gif')
})
const pauseGif = () => {
  // adapted from https://stackoverflow.com/a/24707088
  // create canvas element from first frame of video
  if (!imageIsGif.value) { return }
  const image = imageElement.value
  const width = image.width
  const height = image.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(image, 0, 0, width, height)
  let attr
  let i = 0
  for (i = 0; i < image.attributes.length; i++) {
    attr = image.attributes[i]
    if (attr.name !== '"') { // test for invalid attributes
      canvas.setAttribute(attr.name, attr.value)
    }
  }
  canvas.style.position = 'absolute'
  canvas.classList.add('pause')
  image.parentNode.insertBefore(canvas, image)
  image.style.opacity = 0
}
const canvasElement = () => {
  const canvasElement = imageElement.value?.previousElementSibling
  const isCanvas = canvasElement?.nodeName === 'CANVAS'
  if (!isCanvas) { return }
  return canvasElement
}
const playGif = () => {
  // remove pause canvas
  if (!imageIsGif.value) { return }
  const canvas = canvasElement()
  canvas.remove()
  imageElement.value.style.opacity = 1
}
const updateCanvasSelectedClass = () => {
  if (!globalStore.currentUserIsPainting) { return }
  const canvas = canvasElement()
  if (!canvas) { return }
  const multipleCardsSelectedIds = globalStore.multipleCardsSelectedIds
  const isSelected = multipleCardsSelectedIds.includes(props.cardId)
  if (!isSelected) { return }
  canvas.classList.add('selected')
}
const removeCanvasSelectedClass = () => {
  const canvas = canvasElement()
  if (!canvas) { return }
  canvas.classList.remove('selected')
}

// serve smaller images w imgproxy

const imgproxyUrl = (imageUrl, width, height) => {
  if (props.pendingUploadDataUrl) {
    return props.pendingUploadDataUrl
  }
  const containerBreakpoints = [400, 600, 800, 1200, 3000]
  const devicePixelRatio = Math.round(window.devicePixelRatio || 1)
  const maxDimensions = Math.max(width, height)
  let url = utils.imgproxyUrl(imageUrl)
  for (const breakpoint of containerBreakpoints) {
    if (maxDimensions <= breakpoint) {
      url = utils.imgproxyUrl(imageUrl, breakpoint * devicePixelRatio)
    }
  }
  return url
}

// events

const handleSuccess = (event) => {
  emit('loadSuccess')
}
const handleError = (event) => {
}
</script>

<template lang="pug">
//- Video
video(v-if="Boolean(video)" autoplay loop muted playsinline :key="video" :class="{selected: isSelectedOrDragging}" @canplay="handleSuccess" ref="videoElement" @load="handleSuccess")
  source(:src="video")
//- Image
img.image(
  v-if="state.imageUrl"
  ref="imageElement"
  :src="state.imageUrl"
  :class="{selected: isSelectedOrDragging}"
  @load="handleSuccess"
  @error="handleError"
  loading="lazy"
)
</template>

<style lang="stylus">
.media-card
  .image,
  video
    border-radius var(--entity-radius)
    display block
    -webkit-touch-callout none // prevents safari mobile press-and-hold from interrupting
    &.selected
      mix-blend-mode color-burn
</style>
