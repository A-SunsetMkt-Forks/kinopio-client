<script setup>
import { reactive, computed, onMounted, onUnmounted, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'
import { useApiStore } from '@/stores/useApiStore'
import { useThemeStore } from '@/stores/useThemeStore'

import UserLabelInline from '@/components/UserLabelInline.vue'
import Textarea from '@/components/Textarea.vue'
import Loader from '@/components/Loader.vue'
import utils from '@/utils.js'
import consts from '@/consts.js'
import { nanoid } from 'nanoid'

const globalStore = useGlobalStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()
const apiStore = useApiStore()
const themeStore = useThemeStore()

const dialogElement = ref(null)
const textareaWrapElement = ref(null)
let sessionToken

onMounted(() => {
  window.addEventListener('resize', updateDialogHeight)
})

const emit = defineEmits(['updateCount'])

const props = defineProps({
  visible: Boolean
})
watch(() => props.visible, (value, prevValue) => {
  if (value) {
    restorePrevInviteEmails()
    updateDialogHeight()
    clearErrors()
    createSessionToken()
  } else {
    state.defaultEmailsValue = ''
  }
})

const state = reactive({
  count: 0,
  dialogHeight: null,
  emailsList: [],
  emailsStringWithMatches: '',
  isLoading: false,
  defaultEmailsValue: '',
  errors: {
    noRecipients: false,
    unknownServerError: false
  },
  isSuccess: false
})

const isDarkTheme = computed(() => themeStore.getIsThemeDark)
const currentUser = computed(() => userStore.getUserAllState)
const updateDialogHeight = async () => {
  if (!props.visible) { return }
  await nextTick()
  const element = dialogElement.value
  state.dialogHeight = utils.elementHeight(element)
}
const hideUserDetails = () => {
  globalStore.userDetailsIsVisible = false
}

// session token

const createSessionToken = () => {
  if (!currentUserIsUpgraded.value) { return }
  sessionToken = nanoid()
  apiStore.createSessionToken(sessionToken)
}

// requires upgraded user (temp)

const currentUserIsUpgraded = computed(() => userStore.isUpgraded)
const triggerUpgradeUserIsVisible = () => {
  globalStore.closeAllDialogs()
  globalStore.triggerUpgradeUserIsVisible()
}

// emails

const restorePrevInviteEmails = () => {
  if (userStore.prevInviteEmails) {
    state.defaultEmailsValue = userStore.prevInviteEmails
    updateEmailsWithMatches(state.defaultEmailsValue)
  }
}
const maxEmailsAllowed = computed(() => consts.maxInviteEmailsAllowedToSend)
const updateEmailsWithMatches = (value) => {
  clearErrors()
  state.emailsList = utils.emailsFromString(value)
  state.emailsStringWithMatches = value
  state.emailsList.forEach(email => {
    state.emailsStringWithMatches = state.emailsStringWithMatches.replace(email, `<span class="match">${email}</span>`)
  })
  userStore.updateUser({ prevInviteEmails: value })
  updateDialogHeight()
}
const emailsPlaceholder = computed(() => 'space@jam.com, hi@kinopio.club')

// send button

const emailPlural = computed(() => {
  if (state.emailsList.length === 1) {
    return 'Email'
  } else {
    return utils.pluralize('Email', state.emailsList.length)
  }
})
const emailsLength = computed(() => {
  if (state.emailsList.length) {
    return state.emailsList.length
  } else {
    return null
  }
})
const clearErrors = () => {
  state.errors.noRecipients = false
  state.isSuccess = false
  state.errors.unknownServerError = false
  state.errors.maxEmailsAllowed = false
}
const sendInvites = async () => {
  if (state.isLoading) { return }
  if (!state.emailsList.length) {
    state.errors.noRecipients = true
    return
  }
  if (state.emailsList.length > maxEmailsAllowed.value.length) {
    state.errors.maxEmailsAllowed = true
    return
  }
  clearErrors()
  try {
    state.isLoading = true
    await apiStore.sendSpaceInviteEmails({
      emailsList: state.emailsList,
      spaceId: spaceStore.id,
      sessionToken
    })
    state.isSuccess = true
    notifySuccessAndClose()
  } catch (error) {
    console.error('🚒 sendInvites', error)
    state.errors.unknownServerError = true
  }
  state.isLoading = false
}

const notifySuccessAndClose = () => {
  const message = `Sent ${emailsLength.value} Invite ${emailPlural.value}`
  globalStore.addNotification({ message, type: 'success', icon: 'mail' })
  globalStore.triggerCloseChildDialogs()
}
</script>

<template lang="pug">
dialog.email-invites(v-if="visible" :open="visible" @click.left.stop="hideUserDetails" ref="dialogElement" :style="{'max-height': state.dialogHeight + 'px'}")
  section
    p Email Invites to Edit
  section
    section.subsection
      .mail-subsection(:class="{ dark: isDarkTheme }")
        template(v-if="!currentUserIsUpgraded")
          p To send invite emails, you'll need to upgrade
          button(@click.left.stop="triggerUpgradeUserIsVisible") Upgrade for Unlimited
        template(v-if="currentUserIsUpgraded")
          //- from
          p.field-title From
          UserLabelInline(:user="currentUser" :isClickable="true")
          span.badge.danger.add-your-name(v-if="!currentUser.name")
            span Add Your Name
          //- to
          .row.title-row
            p.field-title To
          Textarea(
            @updateName="updateEmailsWithMatches"
            :defaultValue="state.defaultEmailsValue"
            :placeholder="emailsPlaceholder"
            :htmlStringWithMatches="state.emailsStringWithMatches"
            :maxLength="600"
          )
          //- send
          .row.button-row
            button(@click.stop="sendInvites" :class="{ active: state.isLoading }")
              img.icon.mail(src="@/assets/mail.svg")
              span Send {{emailsLength}} {{emailPlural}}
              Loader(:visible="state.isLoading")
          //- status
          Transition(name="fadeIn")
            .row(v-if="state.errors.noRecipients")
              .badge.danger To field is missing valid email addresses
          Transition(name="fadeIn")
            .row(v-if="state.errors.maxEmailsAllowed")
              .badge.danger For spam prevention reasons, you cannot invite more than {{maxEmailsAllowed}} people at once
          Transition(name="fadeIn")
            .row(v-if="state.errors.unknownServerError")
              .badge.danger
                span (シ_ _)シ Something went wrong, Please try again or contact support
</template>

<style lang="stylus">
dialog.email-invites
  overflow auto
  .title-row
    margin-bottom 0
  section.subsection
    border-radius var(--entity-radius)
    padding 0
    overflow hidden
  .mail-subsection
    --color1 #d93125
    --color2 #1240d5
    padding 8px
    border 4px solid transparent
    border-image 4 repeating-linear-gradient(
      -45deg,
      var(--color1) 0,
      var(--color1) 1em,
      transparent 0,
      transparent 2em,
      var(--color2) 0,
      var(--color2) 3em,
      transparent 0,
      transparent 4em
    )
    &.dark
      --color1 #bd1f14
      --color2 #1f44bf
  .add-your-name
    margin-left 6px !important
  .field-title
    margin-bottom 2px
  .button-row
    margin-top 10px
</style>
