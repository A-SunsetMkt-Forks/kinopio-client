<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, onUnmounted, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useConnectionStore } from '@/stores/useConnectionStore'
import { useBoxStore } from '@/stores/useBoxStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'

import utils from '@/utils.js'

const globalStore = useGlobalStore()
const connectionStore = useConnectionStore()
const boxStore = useBoxStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()

const props = defineProps({
  box: Object
})
const state = reactive({
  position: null
})

const canEditBox = computed(() => userStore.getUserCanEditBox(props.box))
const connectionTypes = computed(() => connectionStore.getItemConnectionTypes(props.box.id))

// styles

const positionStyles = computed(() => {
  const buttonWidth = 36
  const width = props.box.resizeWidth
  const x = props.box.x + width - buttonWidth
  return {
    left: x + 'px',
    top: props.box.y + 'px',
    zIndex: props.box.z
  }
})
const backgroundStyles = computed(() => {
  return { backgroundColor: 'transparent' }
})

// theme colors

const backgroundColorIsDark = computed(() => {
  const color = props.box.color
  return utils.colorIsDark(color)
})
const isThemeDark = computed(() => userStore.theme === 'dark')
const isDarkInLightTheme = computed(() => {
  if (props.box.fill === 'empty') {
    return isThemeDark.value
  } else {
    return backgroundColorIsDark.value && !isThemeDark.value
  }
})
const isLightInDarkTheme = computed(() => {
  if (props.box.fill === 'empty') {
    return !isThemeDark.value
  } else {
    return !backgroundColorIsDark.value && isThemeDark.value
  }
})

// unlock

const unlockBox = (event) => {
  if (globalStore.currentUserIsDrawingConnection) { return }
  event.stopPropagation()
  // notify read only if user cannot edit
  if (!canEditBox.value) {
    const position = utils.cursorPositionInPage(event)
    globalStore.addNotificationWithPosition({ message: 'Box is Read Only', position, type: 'info', layer: 'space', icon: 'cancel' })
    return
  }
  globalStore.currentUserIsDraggingBox = false
  boxStore.updateBox({
    id: props.box.id,
    isLocked: false
  })
}

</script>

<template lang="pug">
.box-unlock-button.inline-button-wrap.item-unlock-button(:style="positionStyles" @mouseup.left="unlockBox" @touchend="unlockBox" :data-item-id="box.id")
  button.inline-button(tabindex="-1" :style="backgroundStyles" :class="{'is-light-in-dark-theme': isLightInDarkTheme, 'is-dark-in-light-theme': isDarkInLightTheme}")
    .connected-colors
      template(v-for="type in connectionTypes" :key="type.id")
        .color(:style="{ background: type.color}")
    img.icon.lock-icon(src="@/assets/lock.svg")
</template>

<style lang="stylus">
.box-unlock-button
  transform-origin top left
  pointer-events all
  cursor pointer
  position absolute
  button
    cursor pointer
  .lock-icon
    position absolute
    left 5.5px
    top 2px
    height 10px
  .is-light-in-dark-theme
    border-color var(--primary-on-light-background)
    .icon
      filter none
  .is-dark-in-light-theme
    border-color var(--primary-on-dark-background)
    .icon
      filter invert()
  .connected-colors
    position absolute
    left 0
    top 0
    display flex
    height 100%
    width 100%
    border-radius calc(var(--entity-radius) - 1px)
    overflow hidden
    .color
      width 100%

</style>
