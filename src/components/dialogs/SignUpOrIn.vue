<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'
import { useApiStore } from '@/stores/useApiStore'
import { useBroadcastStore } from '@/stores/useBroadcastStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { useGlobalStore } from '@/stores/useGlobalStore'

import utils from '@/utils.js'
import Loader from '@/components/Loader.vue'
import cache from '@/cache.js'
import postMessage from '@/postMessage.js'

import inboxSpace from '@/data/inbox.json'
import helloSpace from '@/data/hello.json'

import { nanoid } from 'nanoid'
import { v4 as uuidv4 } from 'uuid' // polyfill for self.crypto.randomUUID(), for legacy todesktop suppor

const globalStore = useGlobalStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()
const apiStore = useApiStore()
const broadcastStore = useBroadcastStore()
const themeStore = useThemeStore()

let shouldLoadLastSpace
let sessionToken

const emailElement = ref(null)

const emit = defineEmits(['loading'])

const props = defineProps({
  visible: Boolean
})
watch(() => props.visible, (value, prevValue) => {
  if (value) {
    clearErrors()
    createSessionToken()
    globalStore.shouldExplicitlyHideFooter = true
    focusEmail()
  } else {
    globalStore.shouldExplicitlyHideFooter = false
  }
})

const state = reactive({
  email: '',
  password: '',
  signUpVisible: true,
  resetVisible: false,
  error: {
    passwordMatch: false,
    unknownServerError: false,
    accountAlreadyExists: false,
    signInCredentials: false,
    tooManyAttempts: false,
    passwordTooShort: false,
    passwordMatchesEmail: false,
    resetUserEmailNotFound: false
  },
  loading: {
    signUpOrIn: false,
    resetPassword: false
  },
  resetSuccess: false
})
watch(() => state.loading.signUpOrIn, (value, prevValue) => {
  emit('loading', value)
})

// dialog state

const showSignUpVisible = () => {
  state.signUpVisible = true
  clearErrors()
  focusEmail()
}
const hideSignUpVisible = () => {
  state.signUpVisible = false
  state.resetVisible = false
  clearErrors()
  focusEmail()
}
const createSessionToken = () => {
  sessionToken = nanoid()
  apiStore.createSessionToken(sessionToken)
}
const focusEmail = async () => {
  await nextTick()
  const element = emailElement.value
  if (!element) { return }
  element.focus()
}
const groupToJoinOnLoad = computed(() => globalStore.groupToJoinOnLoad)

// errors

const clearErrors = () => {
  for (const errorType in state.error) {
    state.error[errorType] = false
  }
  state.resetSuccess = false
}
const hasErrors = () => {
  let hasErrors
  for (const errorType in state.error) {
    if (state.error[errorType] === true) {
      hasErrors = true
    }
  }
  return hasErrors
}
const handleErrors = async (response) => {
  state.loading.signUpOrIn = false
  state.loading.resetPassword = false
  state.error.signInCredentials = false
  state.error.accountAlreadyExists = false
  state.error.tooManyAttempts = false
  state.error.unknownServerError = false
  if (!response) {
    state.error.unknownServerError = true
    return
  }
  if (response.type === 'unique violation') {
    state.error.accountAlreadyExists = true
  } else if (response.status === 401) {
    state.error.signInCredentials = true
  } else if (response.status === 429) {
    state.error.tooManyAttempts = true
  } else {
    state.error.unknownServerError = true
  }
  console.error('🚒', response)
}

// reset password

const toggleResetVisible = () => {
  state.resetVisible = !state.resetVisible
}
const isPasswordMatchesEmail = (email, password) => {
  const emailNameIndex = email.indexOf('@')
  const name = email.slice(0, emailNameIndex)
  if (email === password || name === password) {
    state.error.passwordMatchesEmail = true
  } else {
    return true
  }
}
const resetPassword = async (event) => {
  if (state.loading.resetPassword || state.resetSuccess) { return }
  const email = event.target[0].value.toLowerCase()
  state.loading.resetPassword = true
  const response = await apiStore.resetPassword(email)
  state.loading.resetPassword = false
  if (response.status === 404) {
    state.error.resetUserEmailNotFound = true
  } else if (response.status === 429) {
    state.error.tooManyAttempts = true
  } else {
    state.resetSuccess = true
  }
}

// sign up

const isSignUpPasswordsMatch = (password, confirmPassword) => {
  if (password !== confirmPassword) {
    state.error.passwordMatch = true
  } else {
    return true
  }
}
const isSignUpPasswordTooShort = (password) => {
  if (password.length < 4) {
    state.error.passwordTooShort = true
  } else {
    return true
  }
}
const migrationAppleAppAccountToken = () => {
  const appleToken = userStore.appleAppAccountToken
  if (!appleToken) {
    userStore.appleAppAccountToken = uuidv4()
  }
}
const signUp = async (event) => {
  if (state.loading.signUpOrIn) { return }
  const email = event.target[0].value.toLowerCase()
  const password = event.target[1].value
  const confirmPassword = event.target[2].value
  migrationAppleAppAccountToken()
  const currentUser = userStore.getUserAllState
  if (!isPasswordMatchesEmail(email, password)) { return }
  if (!isSignUpPasswordTooShort(password)) { return }
  if (!isSignUpPasswordsMatch(password, confirmPassword)) { return }
  state.loading.signUpOrIn = true
  const response = await apiStore.signUp({ email, password, currentUser, sessionToken })
  const newUser = await response.json()
  if (isSuccess(response)) {
    globalStore.clearAllNotifications()
    // update user
    userStore.initializeUserState(newUser)
    // update and save spaces
    await backupLocalSpaces()
    await migrationSpacesConnections()
    await updateLocalSpacesUser()
    updateCurrentSpaceWithNewUser(currentUser, newUser)
    await apiStore.createSpaces()
    notifySignedIn()
    notifyIsJoiningGroup()
    userStore.checkIfShouldJoinGroup()
    await addCollaboratorToInvitedSpaces()
    globalStore.triggerUpdateWindowHistory()
    themeStore.restoreTheme()
  } else {
    await handleErrors(newUser)
  }
}

// sign in

const signIn = async (event) => {
  if (state.loading.signUpOrIn) { return }
  const previousUser = userStore.getUserAllState
  const email = event.target[0].value.toLowerCase()
  const password = event.target[1].value
  state.loading.signUpOrIn = true
  const response = await apiStore.signIn({ email, password })
  const result = await response.json()
  state.loading.signUpOrIn = false
  if (isSuccess(response)) {
    globalStore.isLoadingSpace = true
    globalStore.addNotification({ message: 'Signing In…' })
    userStore.initializeUserState(result)
    // update edited local spaces to remote user
    await removeUneditedSpace('Hello Kinopio')
    await removeUneditedSpace('Inbox')
    await migrationSpacesConnections()
    await updateLocalSpacesUser()
    await apiStore.createSpaces()
    notifySignedIn()
    notifyIsJoiningGroup()
    userStore.checkIfShouldJoinGroup()
    // add remote spaces
    const spaces = await apiStore.getUserSpaces()
    await cache.addSpaces(spaces)
    globalStore.clearAllNotifications()
    await addCollaboratorToInvitedSpaces()
    globalStore.triggerSpaceDetailsVisible()
    globalStore.isLoadingFavorites = true
    userStore.restoreUserAssociatedData()
    globalStore.triggerUpdateNotifications()
    themeStore.restoreTheme()
    if (shouldLoadLastSpace) {
      await spaceStore.loadLastSpace()
      globalStore.triggerUpdateWindowHistory()
    }
    globalStore.isLoadingSpace = false
  } else {
    await handleErrors(result)
  }
}

// success

const isSuccess = (response) => {
  const success = [200, 201, 202, 204]
  return Boolean(success.includes(response.status))
}
const notifySignedIn = () => {
  state.loading.signUpOrIn = false
  globalStore.closeAllDialogs()
  globalStore.removeNotificationByMessage('Signing In…')
  globalStore.addNotification({ message: 'Signed In', type: 'success' })
  globalStore.currentUserIsInvitedButCannotEditCurrentSpace = false
}
const notifyIsJoiningGroup = () => {
  if (!globalStore.shouldNotifyIsJoiningGroup) { return }
  globalStore.updateNotifyIsJoiningGroup(true)
}

// update spaces on success

const backupLocalSpaces = async () => {
  const spaces = await cache.getAllSpaces()
  await cache.saveLocal('spacesBackup', spaces)
}
const migrationSpacesConnections = async () => {
  const spaces = await cache.getAllSpaces()
  const newSpaces = spaces.map(space => {
    space.connections = utils.migrationConnections(space.connections)
    return space
  })
  newSpaces.forEach(space => {
    cache.saveSpace(space)
  })
}
const updateLocalSpacesUser = async () => {
  const user = userStore.getUserPublicMeta
  const spaces = await cache.getAllSpaces()
  const newSpaces = utils.updateSpacesUser(user, spaces)
  for (const space of newSpaces) {
    await cache.saveSpace(space)
  }
}
const updateCurrentSpaceWithNewUser = (previousUser, newUser) => {
  const userIsSpaceUser = userStore.getUserIsSpaceUserByUser(previousUser)
  if (!userIsSpaceUser) { return }
  spaceStore.removeUserFromSpace(previousUser)
  spaceStore.addUserToSpace(newUser)
  spaceStore.spectators = []
}
const removeUneditedSpace = async (spaceName) => {
  const currentSpace = await cache.getSpaceByName(spaceName)
  if (!currentSpace) { return }
  let isInvitedSpaces = await cache.invitedSpaces()
  isInvitedSpaces = Boolean(isInvitedSpaces.length)
  let space
  if (spaceName === 'Hello Kinopio') {
    space = helloSpace
  } else if (spaceName === 'Inbox') {
    space = inboxSpace
  }
  const cardNames = space.cards.map(card => card.name)
  let spaceIsEdited
  const cards = currentSpace?.cards || []
  cards.forEach(card => {
    if (!card.name.trim()) { return }
    const cardIsNew = !cardNames.includes(card.name)
    if (cardIsNew) {
      spaceIsEdited = true
    }
  })
  if (!spaceIsEdited) {
    console.info('🌹 signIn removeUneditedSpace', spaceName)
    await cache.deleteSpace(currentSpace)
    if (!isInvitedSpaces) {
      shouldLoadLastSpace = true
    }
  } else {
    console.info('🌹 signIn removeUneditedSpace isEdited: keep space', spaceName, spaceIsEdited, cardNames, currentSpace?.cards)
  }
}

// update user on success

const addCollaboratorToCurrentSpace = async () => {
  const invitedSpaces = await cache.invitedSpaces()
  const invitedSpaceIds = invitedSpaces.map(space => space?.id)
  const currentSpace = spaceStore.getSpaceAllState
  const currentUser = userStore.getUserAllState
  if (invitedSpaceIds.includes(currentSpace?.id)) {
    spaceStore.addCollaboratorToSpace(currentUser)
    broadcastStore.close()
    broadcastStore.joinSpaceRoom()
  }
}
const addCollaboratorToInvitedSpaces = async () => {
  let invitedSpaces = await cache.invitedSpaces()
  invitedSpaces = invitedSpaces.map(space => {
    space.userId = userStore.id
    return space
  })
  await addCollaboratorToCurrentSpace()
  await apiStore.addToQueue({ name: 'addCollaboratorToSpaces', body: invitedSpaces })
}
</script>

<template lang="pug">
dialog.narrow.sign-up-or-in(v-if="props.visible" :open="props.visible")
  section
    .segmented-buttons
      button(@click.left="showSignUpVisible" :class="{active : state.signUpVisible}") Sign Up
      button(@click.left="hideSignUpVisible" :class="{active : !state.signUpVisible}") Sign In

  //- Sign Up
  section(v-if="state.signUpVisible")
    p Create an account to share your spaces and access them anywhere
    p(v-if="groupToJoinOnLoad")
      span.badge.info Sign up to join group
    form(@submit.prevent="signUp")
      input(ref="emailElement" name="email" type="email" autocomplete="email" placeholder="Email" required v-model="state.email" @input="clearErrors")
      .badge.info(v-if="state.error.accountAlreadyExists") An account with this email already exists, Sign In instead
      input(type="password" name="password" placeholder="Password" required @input="clearErrors" v-model="state.password")
      input(type="password" name="password" placeholder="Confirm Password" required @input="clearErrors")
      .badge.danger(v-if="state.error.passwordMatch") Passwords must match
      .badge.danger(v-if="state.error.passwordMatchesEmail") Password can't be from your email
      .badge.danger(v-if="state.error.passwordTooShort") Password must be longer than 4 characters
      .badge.danger(v-if="state.error.tooManyAttempts") Too many attempts, try again in 10 minutes
      .badge.danger(v-if="state.error.unknownServerError") (シ_ _)シ Something went wrong, Please try again or contact support
      button(name="signUp" type="submit" :class="{active : state.loading.signUpOrIn}" tabindex="0")
        span Sign Up
        Loader(:visible="state.loading.signUpOrIn")

  //- Sign In
  section(v-else)
    p Welcome back
    p(v-if="groupToJoinOnLoad")
      span.badge.info Sign in to join group
    form(@submit.prevent="signIn")
      input.email(ref="emailElement" name="email" type="email" autocomplete="email" placeholder="Email" required v-model="state.email" @input="clearErrors")
      input(type="password" name="password" placeholder="Password" required v-model="state.password" @input="clearErrors")
      .badge.danger(v-if="state.error.unknownServerError") (シ_ _)シ Something went wrong, Please try again or contact support
      .badge.danger(v-if="state.error.signInCredentials") Incorrect email or password
      .badge.danger(v-if="state.error.tooManyAttempts") Too many attempts, try again in 10 minutes
      button(name="signIn" type="submit" :class="{active : state.loading.signUpOrIn}" tabindex="0")
        span Sign In
        Loader(:visible="state.loading.signUpOrIn")

  //- Privacy Policy
  section(v-if="state.signUpVisible")
    .button-wrap
      a(href="https://help.kinopio.club/posts/privacy-policy")
        button
          span Privacy Policy and TOS{{' '}}
          img.icon.visit(src="@/assets/visit.svg")

  //- Forgot Password
  section.forgot-password(v-else)
    button(@click.left="toggleResetVisible" :class="{active : state.resetVisible}")
      span Forgot Password?
    div(v-show="state.resetVisible")
      form.reset-form(@submit.prevent="resetPassword")
        input(type="email" placeholder="Email" required @input="clearErrors")
        button(type="submit" :class="{active : state.loading.resetPassword || state.resetSuccess}")
          span Reset Password
          Loader(:visible="state.loading.resetPassword")
      .badge.danger(v-if="state.error.resetUserEmailNotFound") A user with that that email address wasn't found. Try another?
      .badge.danger(v-if="state.error.tooManyAttempts") Too many attempts, try again in 10 minutes
      //- sucesss
      .badge.success(v-if="state.resetSuccess") Password Reset Email Sent
      p.success-message(v-if="state.resetSuccess") If you don't see the email, please check your spam folder, or contact support
</template>

<style lang="stylus">
dialog.sign-up-or-in
  left initial
  right 8px
  overflow auto
  .reset-form
    margin-top 10px
  p,
  .badge
    margin-bottom 10px
  .success-message
    margin-bottom 0
  .forgot-password
    .badge
      margin 0
      margin-top 10px
  button
    span
      font-weight normal
</style>
