<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useCardStore } from '@/stores/useCardStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'
import { useBroadcastStore } from '@/stores/useBroadcastStore'
import { useThemeStore } from '@/stores/useThemeStore'

import Loader from '@/components/Loader.vue'
import NameSegment from '@/components/NameSegment.vue'
import utils from '@/utils.js'

const globalStore = useGlobalStore()
const cardStore = useCardStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()
const broadcastStore = useBroadcastStore()
const themeStore = useThemeStore()

let unsubscribes

onMounted(() => {
  updateNameSegments()
  updatePrimaryBackgroundColor()
  window.addEventListener('touchend', disableIsActive)
  window.addEventListener('mouseup', disableIsActive)

  const globalActionUnsubscribe = globalStore.$onAction(
    ({ name, args }) => {
      if (name === 'triggerUpdateOtherCard') {
        if (!props.otherCard) { return }
        if (args[0] !== props.otherCard.id) { return }
        updateNameSegments()
      } else if (name === 'triggerUpdateTheme') {
        updatePrimaryBackgroundColor()
      }
    }
  )
  unsubscribes = () => {
    globalActionUnsubscribe()
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('touchend', disableIsActive)
  window.removeEventListener('mouseup', disableIsActive)
  unsubscribes()
})

watch(() => globalStore.preventDraggedCardFromShowingDetails, (value, prevValue) => {
  disableIsActive()
})

const props = defineProps({
  otherCard: Object,
  url: String,
  parentCardId: String,
  shouldCloseAllDialogs: Boolean,
  shouldTruncateName: Boolean,
  selectedColor: String
})

const state = reactive({
  nameSegments: [],
  primaryBackgroundColor: '',
  isActive: null
})

const isLoadingOtherItems = computed(() => globalStore.isLoadingOtherItems)
const isActive = computed(() => {
  const isFromParentCard = globalStore.currentSelectedOtherItem.parentCardId === props.parentCardId
  const otherCardDetailsIsVisible = globalStore.otherCardDetailsIsVisible
  return otherCardDetailsIsVisible && isFromParentCard
})
const updatePrimaryBackgroundColor = () => {
  state.primaryBackgroundColor = utils.cssVariable('primary-background')
}
const background = computed(() => props.selectedColor || props.otherCard.backgroundColor)
const backgroundColorIsDark = computed(() => {
  const color = background.value || state.primaryBackgroundColor
  return utils.colorIsDark(color)
})
const styles = computed(() => {
  if (!props.otherCard) { return }
  const isThemeDark = themeStore.getIsThemeDark
  let color = utils.cssVariable('primary-on-light-background')
  if (isThemeDark) {
    color = utils.cssVariable('primary-on-dark-background')
  }
  if (backgroundColorIsDark.value) {
    color = utils.cssVariable('primary-on-dark-background')
  }
  return {
    color,
    background: background.value
  }
})

// update card

watch(() => globalStore.isLoadingOtherItems, (value, prevValue) => {
  if (!value) {
    updateNameSegments()
  }
})
watch(() => props.otherCard, (value, prevValue) => {
  if (value) {
    updateNameSegments()
  }
})
const updateNameSegments = () => {
  if (!props.otherCard) { return }
  let card = utils.clone(props.otherCard)
  if (props.shouldTruncateName) {
    card.name = utils.truncated(card.name, 25)
  }
  card = cardStore.cardWithNameSegments(card)
  card.nameSegments = card.nameSegments.map(segment => {
    if (segment.isLink) {
      segment.isLink = false
      segment.isText = true
      segment.content = segment.name
    } else if (segment.isText) {
      segment.markdown = utils.markdownSegments(segment.content)
    }
    return segment
  })
  state.nameSegments = card.nameSegments
}

// otherCardDetails

const showOtherCardDetailsIsVisible = async (event) => {
  state.isActive = false
  if (utils.isMultiTouch(event)) { return }
  if (globalStore.preventDraggedCardFromShowingDetails) { return }
  let otherItem = {}
  if (props.otherCard) {
    otherItem = utils.clone(props.otherCard)
  }
  if (props.parentCardId) {
    otherItem.parentCardId = props.parentCardId
    cardStore.incrementCardZ(props.parentCardId)
  }
  if (props.shouldCloseAllDialogs) {
    globalStore.closeAllDialogs()
  }
  globalStore.currentUserIsDraggingCard = false
  const position = utils.cursorPositionInSpace(event)
  globalStore.otherItemDetailsPosition = position
  globalStore.currentSelectedOtherItem = otherItem
  globalStore.otherCardDetailsIsVisible = true
  globalStore.triggerCancelLocking()
  globalStore.currentUserIsDraggingCard = false
  event.stopPropagation()
  // broadcast
  const updates = {
    userId: userStore.id,
    cardId: props.parentCardId
  }
  broadcastStore.update({ updates, action: 'clearRemoteCardsDragging' })
  await nextTick()
  broadcastStore.update({ updates, action: 'updateRemoteCardDetailsVisible' })
}
const disableIsActive = () => {
  state.isActive = false
}
const enableIsActive = () => {
  state.isActive = true
}
</script>

<template lang="pug">
a.other-card-preview(@click.prevent.stop :href="props.url")
  .badge.button-badge.link-badge.badge-card-button(
    :class="{ active: state.isActive }"
    :style="styles"
    @mousedown.left="enableIsActive"
    @touchstart="enableIsActive"
    @mouseup.prevent="showOtherCardDetailsIsVisible($event)"
    @touchend.prevent="showOtherCardDetailsIsVisible($event)"
  )
    template(v-if="props.otherCard")
      //- removed
      template(v-if="props.otherCard.isRemoved")
        span.badge.danger
          img.icon(src="@/assets/remove.svg")
      //- name
      template(v-for="segment in state.nameSegments")
        img.card-image(v-if="segment.isImage" :src="segment.url")
        NameSegment(:segment="segment" :backgroundColorIsDark="backgroundColorIsDark")
    template(v-else)
      Loader(:visible="true" :isSmall="true" :isStatic="!isLoadingOtherItems")
      span Card

</template>

<style lang="stylus">
.other-card-preview
  display block
  text-decoration none
  word-wrap break-word
  width 100%
  .link-badge
    display block
    margin 0
  .card-image
    vertical-align middle
    border-radius var(--entity-radius)
    display block
    margin 4px 0px
  .tag
    display inline-block
    pointer-events none
    box-shadow none
  .badge
    > .loader
      vertical-align -2px
  .badge-card-button
    &:hover
      span
        text-decoration none !important
</style>
