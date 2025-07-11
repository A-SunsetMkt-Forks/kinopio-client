<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, onUnmounted, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useCardStore } from '@/stores/useCardStore'
import { useSpaceStore } from '@/stores/useSpaceStore'
import { useThemeStore } from '@/stores/useThemeStore'

import UserLabelInline from '@/components/UserLabelInline.vue'
import NameSegment from '@/components/NameSegment.vue'
import utils from '@/utils.js'

const globalStore = useGlobalStore()
const cardStore = useCardStore()
const spaceStore = useSpaceStore()
const themeStore = useThemeStore()

const props = defineProps({
  visible: Boolean,
  card: Object
})

const backgroundColor = computed(() => {
  return props.card.backgroundColor
})
const styles = computed(() => {
  const zoom = globalStore.getSpaceCounterZoomDecimal
  const offset = 6
  return {
    left: `${props.card.x + offset}px`,
    top: `${props.card.y + offset}px`,
    transform: `scale(${zoom})`,
    backgroundColor: backgroundColor.value
  }
})

const createdByUser = computed(() => {
  // same as userDetailsWrap.cardCreatedByUser
  const userId = props.card.userId
  let user = spaceStore.getSpaceUserById(userId) || globalStore.otherUsers[userId]
  if (!user) {
    user = {
      name: '',
      color: '#cdcdcd' // secondary-active-background
    }
  }
  return user
})
const relativeDate = computed(() => utils.shortRelativeTime(props.card.nameUpdatedAt || props.card.updatedAt))
const backgroundColorIsDark = computed(() => {
  if (backgroundColor.value) {
    return utils.colorIsDark(backgroundColor.value)
  } else {
    return themeStore.getIsThemeDark
  }
})

// name

const normalizedCard = computed(() => {
  const card = cardStore.cardWithNameSegments(props.card)
  card.nameSegments = card.nameSegments.map(segment => {
    if (segment.isText) {
      segment.markdown = utils.markdownSegments(segment.content)
    }
    return segment
  })
  return card
})
const isStrikeThrough = computed(() => {
  return props.card.name.startsWith('[x]')
})
const urlPreviewImage = computed(() => {
  if (!props.card.urlPreviewIsVisible) { return }
  return props.card.urlPreviewImage
})
</script>

<template lang="pug">
.card-comment-preview(v-if="visible" :style="styles")
  UserLabelInline(:user="createdByUser")
  .row
    span.badge.status.inline-badge
      img.icon.time(src="@/assets/time.svg")
      span {{ relativeDate }}
  template(v-for="segment in normalizedCard.nameSegments")
    img.card-image(v-if="segment.isImage" :src="segment.url")
    img.card-image(v-if="urlPreviewImage" :src="urlPreviewImage")
    NameSegment(:segment="segment" :isStrikeThrough="isStrikeThrough" :backgroundColorIsDark="backgroundColorIsDark")
</template>

<style lang="stylus">
.card-comment-preview
  transform-origin top left
  position absolute
  max-width 180px
  background var(--secondary-hover-background)
  padding 4px
  z-index var(--max-z)
  border-radius var(--entity-radius)
  pointer-events none
  overflow hidden
  box-shadow var(--hover-shadow)
  .row
    margin-top 1px
    margin-bottom 6px
  p
    padding 2px
    padding-top 0
    word-wrap break-word
    overflow-wrap break-word
  .tag
    display inline-block
    margin 0
  .card-image
    border-radius var(--entity-radius)
  .name-segment
    white-space pre-wrap
</style>
