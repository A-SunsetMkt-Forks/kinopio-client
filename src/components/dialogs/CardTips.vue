<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'

import UserSettingsCards from '@/components/dialogs/UserSettingsCards.vue'
import utils from '@/utils.js'
import consts from '@/consts.js'

const globalStore = useGlobalStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()

const dialogElement = ref(null)

const props = defineProps({
  visible: Boolean,
  preventScrollIntoView: Boolean,
  shouldHideAdvanced: Boolean
})
const state = reactive({
  markdownInfoIsVisible: false,
  cardsSettingsIsVisible: false
})

watch(() => props.visible, (value, prevValue) => {
  if (value) {
    scrollIntoView()
    updateDialogHeight()
  }
})

const maxCardCharacterLimit = computed(() => consts.cardCharacterLimit)
const shiftEnterShouldAddChildCard = computed(() => userStore.cardSettingsShiftEnterShouldAddChildCard)
const meta = computed(() => utils.metaKey())

// buttons
const closeDialogs = () => {
  state.cardsSettingsIsVisible = false
}
const toggleMarkdownInfoIsVisible = () => {
  state.markdownInfoIsVisible = !state.markdownInfoIsVisible
  if (state.markdownInfoIsVisible) {
    scrollIntoView()
  }
}
const toggleCardSettingsIsVisible = () => {
  state.cardsSettingsIsVisible = !state.cardsSettingsIsVisible
}

// dialog position

const scrollIntoView = async () => {
  if (props.preventScrollIntoView) { return }
  if (utils.isMobile()) { return }
  await nextTick()
  const element = dialogElement.value
  globalStore.scrollElementIntoView({ element })
}
const updateDialogHeight = async () => {
  if (!props.visible) { return }
  await nextTick()
  const element = dialogElement.value
  state.dialogHeight = utils.elementHeight(element)
}
</script>

<template lang="pug">
dialog.card-tips.narrow(v-if="visible" @click.stop="closeDialogs" :open="visible" ref="dialogElement")
  section
    .row.title-row
      span Tips
      .button-details
        button.small-button(@click.stop="toggleCardSettingsIsVisible" :class="{ active: state.cardsSettingsIsVisible }")
          img.settings.icon(src="@/assets/settings.svg")
        UserSettingsCards(:visible="state.cardsSettingsIsVisible")
  section
    article
      div
        .badge.info Character limit is {{maxCardCharacterLimit}}
    article
      .row
        p
          img.icon(src="@/assets/add.svg")
          span Add Card
        span.badge.keyboard-shortcut Enter
    article(v-if="shiftEnterShouldAddChildCard")
      .row
        p
          img.icon(src="@/assets/add.svg")
          span Add Child Card
        span.badge.keyboard-shortcut Shift-Enter
    article
      .row
        p
          img.icon(src="@/assets/line-break.svg")
          span Line Break
        span.badge.keyboard-shortcut
          span(v-if="!shiftEnterShouldAddChildCard") Shift-Enter or{{' '}}
          span Ctrl-Enter
    template(v-if="!shouldHideAdvanced")
      article
        .row
          p
            span Backlinked Tag
          span.badge.keyboard-shortcut [[
      article
        .row
          p
            span Link to Other Spaces
          span.badge.keyboard-shortcut /

    article
      .row
        p
          span Bold selected
        span.badge.keyboard-shortcut {{meta}}-B
    article
      .row
        p
          span Italicize selected
        span.badge.keyboard-shortcut {{meta}}-I
    article
      .row
        p
          span Link selected
        span.badge.keyboard-shortcut {{meta}}-K

      //- article
      //-   .row
      //-     span Comment Card
      //-     span.badge.keyboard-shortcut ((…))

    //- Markdown
    article
      .row
        button(@click.left.stop="toggleMarkdownInfoIsVisible" :class="{ active: state.markdownInfoIsVisible }")
          img.icon.view(v-if="state.markdownInfoIsVisible" src="@/assets/view-hidden.svg")
          img.icon.view(v-else src="@/assets/view.svg")
          span Markdown
      div(v-if="state.markdownInfoIsVisible")
        p
          span.badge.keyboard-shortcut # heading 1
        p
          span.badge.keyboard-shortcut ## heading 2
        p
          span.badge.keyboard-shortcut _italic_ or *italic*
        p
          span.badge.keyboard-shortcut **bold**
        p
          span.badge.keyboard-shortcut ~~strikethrough~~
        p
          span.badge.keyboard-shortcut [link text](url)
        p
          span.badge.keyboard-shortcut `code`
        p
          span.badge.keyboard-shortcut ``` code block ```
</template>

<style lang="stylus">
dialog.card-tips
  left initial
  right 8px
  top 22px
  overflow auto
  overscroll-behavior-y auto
  article
    position static
    margin-bottom 10px
    padding-bottom 10px
    border-bottom 1px solid var(--primary-border)
    &:last-child
      margin-bottom 0
      padding-bottom 0
      border-bottom 0

  label
    margin-left 6px
  .row
    justify-content space-between
</style>
