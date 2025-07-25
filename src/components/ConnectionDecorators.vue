<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useConnectionStore } from '@/stores/useConnectionStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'

import utils from '@/utils.js'
import consts from '@/consts.js'

const connectionStore = useConnectionStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()

const props = defineProps({
  connections: Array
})

const isSpaceMember = computed(() => userStore.getUserIsSpaceMember)
const canEditAll = computed(() => {
  if (isSpaceMember.value) { return true }
  if (!props.connections.length) { return }
  const connectionsCreatedByCurrentUser = props.connections.filter(connection => {
    if (!connection) { return }
    return userStore.getItemIsCreatedByUser(connection)
  })
  return connectionsCreatedByCurrentUser.length === props.connections.length
})

// direction

const path = computed(() => 'M0 0 L20 0')
const gradientIdReference = computed(() => 'url(\'#gradient\')')
const isSomeDirectionsIsVisible = computed(() => {
  const connections = props.connections.filter(connection => connection.directionIsVisible)
  return connections.length
})
const showDirectionsIsVisible = () => {
  const value = !isSomeDirectionsIsVisible.value
  props.connections.forEach(connection => {
    const update = {
      id: connection.id,
      directionIsVisible: value
    }
    connectionStore.updateConnection(update)
  })
}

// label

const isSomeLabelsVisible = computed(() => {
  const connections = props.connections.filter(connection => connection.labelIsVisible)
  return connections.length
})
const showLabelsIsVisible = () => {
  const value = !isSomeLabelsVisible.value
  props.connections.forEach(connection => {
    const update = {
      id: connection.id,
      labelIsVisible: value
    }
    connectionStore.updateConnection(update)
  })
}

// reverse

const reverseConnections = () => {
  props.connections.forEach(connection => {
    const startItemId = connection.endItemId
    const endItemId = connection.startItemId
    const path = connectionStore.getConnectionPathBetweenItems({
      startItemId,
      endItemId,
      controlPoint: connection.controlPoint
    })
    const update = {
      id: connection.id,
      startItemId,
      endItemId,
      path
    }
    connectionStore.updateConnection(update)
  })
}

// curve or straight

const allPathsIsCurved = computed(() => {
  if (!props.connections.length) { return }
  const curvedConnections = props.connections.filter(connection => {
    if (!connection) { return }
    if (!connection.path) { return }
    const controlPoint = utils.curveControlPointFromPath(connection.path)
    const isCurved = controlPoint.x && controlPoint.y
    return isCurved
  })
  return curvedConnections.length === props.connections.length
})
const allPathsIsStraight = computed(() => {
  if (!props.connections.length) { return }
  const curvedConnections = props.connections.filter(connection => {
    if (!connection) { return }
    if (!connection.path) { return }
    const controlPoint = utils.curveControlPointFromPath(connection.path)
    const isCurved = !controlPoint.x && !controlPoint.y
    return isCurved
  })
  return curvedConnections.length === props.connections.length
})
const togglePathIsStraight = (isStraight) => {
  let controlPoint = null
  if (isStraight) {
    controlPoint = consts.straightLineConnectionPathControlPoint
  }
  const updates = []
  props.connections.forEach(connection => {
    const path = connectionStore.getConnectionPathBetweenItems({
      startItemId: connection.startItemId,
      endItemId: connection.endItemId,
      controlPoint
    })
    updates.push({
      id: connection.id,
      controlPoint,
      path
    })
  })
  connectionStore.updateConnections(updates)
  userStore.updateUser({ defaultConnectionControlPoint: controlPoint })
}
</script>

<template lang="pug">
//- Label
.button-wrap
  button(@click.left="showLabelsIsVisible" :class="{ active: isSomeLabelsVisible }" :disabled="!canEditAll")
    span Label
//- Direction
.button-wrap
  button(@click.left="showDirectionsIsVisible" :class="{ active: isSomeDirectionsIsVisible }" :disabled="!canEditAll" title="Direction")
    svg.icon.arrow(width="20px" height="12px" viewBox="0 0 20 2")
      g(stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round")
        path(:d="path" stroke="#000000")
        defs
          linearGradient(id="gradient")
            stop(offset="0%" stop-color="#000000" stop-opacity="0" fill-opacity="0")
            stop(offset="90%" stop-color="#000000")
      circle(r="5" :fill="gradientIdReference")
        animateMotion(dur="3s" repeatCount="indefinite" :path="path" rotate="auto")

//- Reverse
.button-wrap
  button(@click.left="reverseConnections" :disabled="!canEditAll" title="Reverse")
    img.icon.reverse(src="@/assets/connection-reverse.svg")

//- Curved or Straight
.button-wrap.path-curve-options
  .segmented-buttons
    button(:class="{active: allPathsIsCurved}" @click="togglePathIsStraight(false)" title="Curve" :disabled="!canEditAll")
      img.icon.connection-path(src="@/assets/connection-path.svg")
    button(:class="{active: allPathsIsStraight}" @click="togglePathIsStraight(true)" title="Straight" :disabled="!canEditAll")
      img.icon.connection-path(src="@/assets/connection-path-straight.svg")

</template>

<style lang="stylus" scoped>
button
  .icon
    &.clear
      vertical-align 4px
    &.arrow
      vertical-align -2px
    &.reverse,
    &.connection-path
      vertical-align 0
</style>
