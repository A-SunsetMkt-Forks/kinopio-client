<script setup>
import { reactive, computed, onMounted, onUnmounted, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useConnectionStore } from '@/stores/useConnectionStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'
import { useApiStore } from '@/stores/useApiStore'

import Loader from '@/components/Loader.vue'
import utils from '@/utils.js'

const globalStore = useGlobalStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()
const connectionStore = useConnectionStore()
const apiStore = useApiStore()

const emit = defineEmits(['updateSpaces'])

const props = defineProps({
  visible: Boolean
})
watch(() => props.visible, async (value, prevValue) => {
  globalStore.clearNotificationsWithPosition()
  if (value) {
    state.pdfIsVisible = false
    state.spaceIsDuplicated = false
  }
})

const state = reactive({
  spaceIsDuplicated: false,
  dialogHeight: null,
  isLoadingAllSpaces: false,
  unknownServerError: false,
  pdfIsVisible: false
})

const currentUserIsSignedIn = computed(() => userStore.getUserIsSignedIn)
const currentSpace = computed(() => spaceStore.getSpaceAllItems)
const text = computed(() => utils.nameStringFromItems(currentSpace.value.cards))

const fileName = () => {
  const spaceName = spaceStore.name
  const spaceId = spaceStore.id
  const fileName = spaceName || `kinopio-space-${spaceId}`
  return fileName
}
const copyText = async (event) => {
  globalStore.clearNotificationsWithPosition()
  const position = utils.cursorPositionInPage(event)
  try {
    await navigator.clipboard.writeText(text.value)
    globalStore.addNotificationWithPosition({ message: 'Copied', position, type: 'success', layer: 'app', icon: 'checkmark' })
  } catch (error) {
    console.warn('🚑 copyText', error)
    globalStore.addNotificationWithPosition({ message: 'Copy Error', position, type: 'danger', layer: 'app', icon: 'cancel' })
  }
}
const downloadLocalJson = () => {
  const space = utils.clone(currentSpace.value)
  delete space.clients
  const json = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(space))
  const name = fileName()
  const downloadAnchor = document.getElementById('export-downlaod-anchor')
  downloadAnchor.setAttribute('href', json)
  downloadAnchor.setAttribute('download', `${name}.json`)
  downloadAnchor.click()
}
const downloadBlob = (blob, name) => {
  const blobUrl = window.URL.createObjectURL(blob)
  name = name || fileName()
  const downloadAnchor = document.getElementById('export-downlaod-anchor')
  downloadAnchor.setAttribute('href', blobUrl)
  downloadAnchor.setAttribute('download', `${name}.zip`)
  downloadAnchor.click()
}
const downloadAllSpacesRemote = async () => {
  if (state.isLoadingAllSpaces) { return }
  state.unknownServerError = false
  state.isLoadingAllSpaces = true
  try {
    const blob = await apiStore.downloadAllSpaces()
    downloadBlob(blob, 'kinopio-spaces')
  } catch (error) {
    console.error('🚒', error)
    state.unknownServerError = true
  }
  state.isLoadingAllSpaces = false
}
const duplicateSpace = async () => {
  await spaceStore.duplicateSpace()
  state.spaceIsDuplicated = true
  emit('updateSpaces')
}
const triggerSignUpOrInIsVisible = () => {
  globalStore.closeAllDialogs()
  globalStore.triggerSignUpOrInIsVisible()
}

// pdf

const togglePdfIsVisible = () => {
  const isVisible = state.pdfIsVisible
  state.pdfIsVisible = !isVisible
  if (state.pdfIsVisible) {
    pdf()
  }
}
const pdf = async () => {
  try {
    const url = await apiStore.pdf()
    console.info('🌎 pdf url', url)
  } catch (error) {
    console.error('🚒 pdf', error)
    state.unknownServerError = true
  }
}

// json canvas
// https://jsoncanvas.org/spec/1.0/

const downloadLocalCanvas = () => {
  const space = utils.clone(currentSpace.value)
  delete space.clients
  const canvas = convertToCanvas(space)
  console.info('🧚 canvas to download', canvas)
  const json = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(canvas))
  const name = fileName()
  const downloadAnchor = document.getElementById('export-downlaod-anchor')
  downloadAnchor.setAttribute('href', json)
  downloadAnchor.setAttribute('download', `${name}.canvas`)
  downloadAnchor.click()
}
const convertToCanvas = (space) => {
  const canvas = {}
  canvas.nodes = []
  canvas.edges = []
  try {
    space.cards.forEach(card => {
      const node = {
        id: card.id,
        type: 'text',
        x: card.x,
        y: card.y,
        width: card.width,
        height: card.height,
        color: card.backgroundColor,
        text: card.name
      }
      canvas.nodes.push(node)
    })
    space.boxes.forEach(box => {
      const group = {
        id: box.id,
        type: 'group',
        x: box.x,
        y: box.y,
        width: box.resizeWidth,
        height: box.resizeHeight,
        color: box.color,
        label: box.name
      }
    })
    space.connections.forEach(connection => {
      const type = connectionStore.getConnectionTypeByConnectionId(connection.id)
      // direction
      let toEnd = 'none'
      if (connection.directionIsVisible) {
        toEnd = 'arrow'
      }
      // label
      let label
      if (connection.labelIsVisible) {
        label = type.name
      }
      const edge = {
        id: connection.id,
        fromNode: connection.startItemId,
        toNode: connection.endItemId,
        toEnd,
        color: type.color,
        label
      }
      canvas.edges.push(edge)
    })
    return canvas
  } catch (error) {
    console.error('🚒 convertToCanvas', error)
  }
}

</script>

<template lang="pug">
template(v-if="visible")
  section.export
    .row
      button(@click.left="duplicateSpace")
        img.icon.duplicate(src="@/assets/duplicate.svg")
        span Duplicate this Space
    .row
      button(@click.left="copyText")
        img.icon.copy(src="@/assets/copy.svg")
        span Copy All Card Names
    .row(v-if="state.spaceIsDuplicated")
      span.badge.success Space copied

  section.export
    .row
      p Download Space
    .row
      .button-wrap(v-if="currentUserIsSignedIn")
        button(@click.left.stop="togglePdfIsVisible" :class="{ active: state.pdfIsVisible }")
          img.icon.file(src="@/assets/file.svg")
          span PDF
      .button-wrap
        button(@click.left="downloadLocalCanvas")
          img.icon.json-canvas(src="@/assets/json-canvas.svg")
          span Canvas
    p(v-if="state.pdfIsVisible")
      span.badge.success PDF Sent to your Email
    .row
      .button-wrap
        button(@click.left="downloadLocalJson")
          img.icon.file(src="@/assets/file.svg")
          span Kinopio JSON

  section.export
    // anon user
    template(v-if="!currentUserIsSignedIn")
      p
        span Sign Up or In for more export options
      button(@click.left="triggerSignUpOrInIsVisible") Sign Up or In
    // signed in user
    template(v-if="currentUserIsSignedIn")
      button(@click.left="downloadAllSpacesRemote" :class="{ active: state.isLoadingAllSpaces }")
        span Download All Spaces Backup (JSON and TXT)
        Loader(:visible="state.isLoadingAllSpaces")
    a#export-downlaod-anchor.hidden
    .info-container(v-if="state.isLoadingAllSpaces")
      .badge.info This will take a minute or so…
    .info-container(v-if="state.unknownServerError")
      .badge.danger (シ_ _)シ Something went wrong, Please try again or contact support
</template>

<style lang="stylus">
section.export
  max-width stretch
  textarea
    background-color var(--secondary-background)
    border 0
    border-radius var(--small-entity-radius)
    padding 4px
    margin-bottom 4px
    height 100px
  button
    display block
    margin-left 0
    white-space initial
  button + button
    margin-top 10px
  .hidden
    display none
  .info-container
    margin-top 10px
</style>
