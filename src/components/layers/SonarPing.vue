<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useThemeStore } from '@/stores/useThemeStore'

import utils from '@/utils.js'

import { colord } from 'colord'

const globalStore = useGlobalStore()
const themeStore = useThemeStore()

// adapted from https://codepen.io/pillowmermaid/details/xrwVPQ
let canvas, context
let ripples = [] // { x, y, color, radius, shadowRadius, speed, decay, lineWidth, shouldDestroy, opacity }
let unsubscribes

onMounted(() => {
  updateScroll()
  canvas = document.getElementById('sonar')
  context = canvas.getContext('2d')
  window.requestAnimationFrame(rippleFrame)
  window.addEventListener('scroll', updateScroll)
  window.addEventListener('resize', updateScroll)

  const globalActionUnsubscribe = globalStore.$onAction(
    ({ name, args }) => {
      if (name === 'triggerSonarPing') {
        const ping = args[0]
        createRipples(ping)
      }
    }
  )
  unsubscribes = () => {
    globalActionUnsubscribe()
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateScroll)
  window.removeEventListener('resize', updateScroll)
  unsubscribes()
})

watch(() => globalStore.spaceZoomPercent, (value, prevValue) => {
  updateScroll()
})

const state = reactive({
  scroll: { x: 0, y: 0 }
})

const updateScroll = () => {
  state.scroll = globalStore.getWindowScrollWithSpaceOffset
}

const spaceZoomDecimal = computed(() => globalStore.getSpaceZoomDecimal)
const spaceCounterZoomDecimal = computed(() => globalStore.getSpaceCounterZoomDecimal)
const viewportHeight = computed(() => globalStore.viewportHeight)
const viewportWidth = computed(() => globalStore.viewportWidth)
const isDarkTheme = computed(() => themeStore.getIsThemeDark)
const styles = computed(() => {
  return {
    left: state.scroll.x + 'px',
    top: state.scroll.y + 'px'
  }
})

// init and draw

const createRipples = (ping) => {
  const rippleCount = 4
  const { x, y } = ping
  const color = colord(ping.color).toHsl() // { h: 240, s: 100, l: 50, a: 0.5 }
  const shadowColorDelta = 0.2
  let shadowColor
  if (isDarkTheme.value) {
    shadowColor = colord(ping.color).lighten(shadowColorDelta).toHsl()
  } else {
    shadowColor = colord(ping.color).darken(shadowColorDelta).toHsl()
  }
  // create initial ripples
  for (let i = 1; i < rippleCount + 1; i++) {
    const decay = Math.pow(0.65, i)
    const ripple = {
      x,
      y,
      color,
      shadowColor,
      radius: 1,
      shadowRadius: 0,
      speed: 10,
      decay,
      lineWidth: 10,
      shouldDestroy: false,
      opacity: 1
    }
    ripples.push(ripple)
  }
}
const updateRippleOrigin = ({ x, y }) => {
  const zoom = spaceZoomDecimal.value
  x = x - state.scroll.x
  y = y - state.scroll.y
  x = x * zoom
  y = y * zoom
  // left side
  if (x < 0) {
    x = 0
  // right side
  } else if (x > viewportWidth.value) {
    x = viewportWidth.value
  }
  // top side
  if (y < 0) {
    y = 0
  // bottom side
  } else if (y > viewportHeight.value) {
    y = viewportHeight.value
  }
  return { x, y }
}
const drawRipples = () => {
  context.clearRect(0, 0, viewportWidth.value, viewportHeight.value)
  ripples.forEach(ripple => {
    const { lineWidth, shadowRadius, radius, color, shadowColor, opacity } = ripple
    const { x, y } = updateRippleOrigin(ripple)
    // draw shadow
    context.beginPath()
    context.lineWidth = lineWidth + 2
    context.strokeStyle = `hsla(${shadowColor.h}, ${shadowColor.s}%, ${shadowColor.l}%, ${opacity / 2})`
    context.arc(x, y, shadowRadius, 0, 2 * Math.PI)
    context.stroke()
    context.closePath()
    // draw ripple
    context.beginPath()
    context.lineWidth = lineWidth
    context.strokeStyle = `hsla(${color.h}, ${color.s}%, ${color.l}%, ${opacity})`
    context.arc(x, y, radius, 0, 2 * Math.PI)
    context.stroke()
    context.closePath()
  })
}

// frames

const updateRipples = () => {
  const fadeRadius = 250
  const destroyRadius = 400
  ripples = ripples.map(ripple => {
    const radiusDelta = ripple.speed * ripple.decay
    ripple.radius += radiusDelta
    ripple.shadowRadius += radiusDelta
    if (ripple.lineWidth > 1) {
      ripple.lineWidth -= 0.35 * ripple.decay
    }
    if (ripple.radius > fadeRadius && ripple.opacity > 0) {
      ripple.opacity -= 0.1
    }
    if (ripple.radius > destroyRadius) {
      ripple.shouldDestroy = true
    }
    return ripple
  })
  destroyRipples()
}
const rippleFrame = () => {
  if (ripples.length) {
    drawRipples()
    updateRipples()
  }
  requestAnimationFrame(rippleFrame)
}
const destroyRipples = () => {
  ripples = ripples.filter(ripple => !ripple.shouldDestroy)
}
</script>

<template lang="pug">
canvas#sonar(
  :width="viewportWidth"
  :height="viewportHeight"
)
</template>

<style lang="stylus">
canvas#sonar
  pointer-events none
  position fixed
  top 0
  left 0
  background transparent
</style>
