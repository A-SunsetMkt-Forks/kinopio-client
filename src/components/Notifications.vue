<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'
import { useApiStore } from '@/stores/useApiStore'
import { useChangelogStore } from '@/stores/useChangelogStore'

import cache from '@/cache.js'
import consts from '@/consts.js'
import privacy from '@/data/privacy.js'
import utils from '@/utils.js'
import templates from '@/data/templates.js'
import PrivacyIcon from '@/components/PrivacyIcon.vue'
import OfflineBadge from '@/components/OfflineBadge.vue'
import GroupLabel from '@/components/GroupLabel.vue'
import Loader from '@/components/Loader.vue'

import dayjs from 'dayjs'

const globalStore = useGlobalStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()
const apiStore = useApiStore()
const changelogStore = useChangelogStore()

let unsubscribes

let checkIfShouldNotifySpaceOutOfSyncIntervalTimer

const cardsOverLimitElement = ref(null)
const readOnlyElement = ref(null)
const templateElement = ref(null)

onMounted(() => {
  update()
  window.addEventListener('visibilitychange', updatePageVisibilityChange)
  window.addEventListener('focus', updatePageVisibilityChangeOnFocus)
  checkIfShouldNotifySpaceOutOfSyncIntervalTimer = setInterval(() => {
    checkIfShouldNotifySpaceOutOfSync()
  }, 1000 * 60 * 60 * 1) // check every hour

  const globalActionUnsubscribe = globalStore.$onAction(
    ({ name, args }) => {
      if (name === 'addNotification') {
        update()
      } else if (name === 'triggerReadOnlyJiggle') {
        addReadOnlyJiggle()
      } else if (name === 'notifyCardsCreatedIsOverLimit') {
        toggleNotifyCardsCreatedIsOverLimit(true)
      } else if (name === 'triggerCheckIfShouldNotifySpaceOutOfSync') {
        checkIfShouldNotifySpaceOutOfSync()
      } else if (name === 'triggerNotifyCouldNotSave') {
        state.notifiyCouldNotSave = true
      }
    }
  )
  const spaceActionUnsubscribe = spaceStore.$onAction(
    ({ name, args }) => {
      if (name === 'restoreSpace') {
        toggleNotifySpaceOutOfSync(false)
      }
    }
  )
  unsubscribes = () => {
    globalActionUnsubscribe()
    spaceActionUnsubscribe()
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('visibilitychange', updatePageVisibilityChange)
  window.removeEventListener('focus', updatePageVisibilityChangeOnFocus)
  clearInterval(checkIfShouldNotifySpaceOutOfSyncIntervalTimer)
  unsubscribes()
})

watch(() => globalStore.currentUserIsPainting, (value, prevValue) => {
  if (value) {
    addReadOnlyJiggle()
  }
})

const state = reactive({
  readOnlyJiggle: false,
  notifyCardsCreatedIsOverLimitJiggle: false,
  notifySpaceOutOfSync: false,
  notifiyCouldNotSave: false
})

const closeAllDialogs = () => {
  globalStore.closeAllDialogs()
}

// user

const currentUserIsPaintingLocked = computed(() => globalStore.currentUserIsPaintingLocked)
const currentUserIsResizingCard = computed(() => globalStore.currentUserIsResizingCard)
const currentUserIsResizingBox = computed(() => globalStore.currentUserIsResizingBox)
const currentUserIsTiltingCard = computed(() => globalStore.currentUserIsTiltingCard)
const currentUserIsPanning = computed(() => globalStore.currentUserIsPanning)
const currentUserIsPanningReady = computed(() => globalStore.currentUserIsPanningReady)
const currentUserIsSignedIn = computed(() => userStore.getUserIsSignedIn)
const currentUserIsUpgraded = computed(() => userStore.isUpgraded)
const isTouchDevice = computed(() => globalStore.isTouchDevice)
const shouldSnapToGrid = computed(() => globalStore.shouldSnapToGrid)

// space

const privacyState = computed(() => {
  return privacy.states().find(state => {
    return state.name === spaceStore.privacy
  })
})
const cardsCreatedCountFromLimit = computed(() => {
  const cardsCreatedLimit = consts.cardsCreatedLimit
  const cardsCreatedCount = userStore.cardsCreatedCount
  return Math.max(cardsCreatedLimit - cardsCreatedCount, 0)
})
const currentSpaceIsTemplate = computed(() => {
  if (globalStore.isLoadingSpace) { return }
  if (globalStore.isPresentationMode) { return }
  const currentSpace = spaceStore.getSpaceAllState
  if (currentSpace.isTemplate) { return true }
  const templateSpaceIds = templates.spaces().map(space => space.id)
  return templateSpaceIds.includes(currentSpace.id)
})

// space out of sync

const updatePageVisibilityChangeOnFocus = async (event) => {
  await nextTick()
  updatePageVisibilityChange()
}
const updatePageVisibilityChange = (event) => {
  checkIfShouldNotifySpaceOutOfSync()
}
const toggleNotifySpaceOutOfSync = (value) => {
  state.notifySpaceOutOfSync = value
}
const checkIfShouldNotifySpaceOutOfSync = async () => {
  if (document.visibilityState !== 'visible') { return }
  if (state.notifySpaceOutOfSync) { return }
  if (globalStore.isLoadingSpace) { return }
  try {
    if (!currentUserIsSignedIn.value) { return }
    if (!spaceStore.updatedAt) {
      return
    } // don't check unloaded spaces
    const remoteSpace = await apiStore.getSpaceUpdatedAt({ id: spaceStore.id })
    if (!remoteSpace) { return }
    const space = spaceStore.getSpaceAllState
    const spaceeditedAt = dayjs(space.editedAt)
    const remoteSpaceeditedAt = dayjs(remoteSpace.editedAt)
    const deltaMinutes = remoteSpaceeditedAt.diff(spaceeditedAt, 'minute')
    const editedAtIsChanged = deltaMinutes >= 1
    if (editedAtIsChanged) {
      console.info('☎️ checkIfShouldNotifySpaceOutOfSync result', {
        editedAtIsChanged,
        spaceeditedAt: spaceeditedAt.fromNow(),
        remoteSpaceeditedAt: remoteSpaceeditedAt.fromNow(),
        deltaMinutes
      })
      state.notifySpaceOutOfSync = true
    }
  } catch (error) {
    console.error('🚒 checkIfShouldNotifySpaceOutOfSync', error)
    state.notifySpaceOutOfSync = true
  }
}

// notifications

const items = computed(() => globalStore.notifications)
const notifySpaceNotFound = computed(() => globalStore.notifySpaceNotFound)
const notifyConnectionError = computed(() => globalStore.notifyConnectionError)
const notifyConnectionErrorName = computed(() => globalStore.notifyConnectionErrorName)
const notifyServerCouldNotSave = computed(() => {
  const isOffline = !globalStore.isOnline
  if (isOffline) { return }
  return globalStore.notifyServerCouldNotSave
})
const notifySpaceIsRemoved = computed(() => globalStore.notifySpaceIsRemoved)
const notifySignUpToEditSpace = computed(() => {
  return globalStore.notifySignUpToEditSpace || globalStore.currentUserIsInvitedButCannotEditCurrentSpace
})
const notifyCardsCreatedIsNearLimit = computed(() => globalStore.notifyCardsCreatedIsNearLimit)
const notifyCardsCreatedIsOverLimit = computed(() => globalStore.notifyCardsCreatedIsOverLimit)
const notifyMoveOrCopyToSpace = computed(() => globalStore.notifyMoveOrCopyToSpace)
const notifyMoveOrCopyToSpaceDetails = computed(() => globalStore.notifyMoveOrCopyToSpaceDetails)
const notifySpaceIsHidden = computed(() => globalStore.notifySpaceIsHidden)
const notifyCurrentSpaceIsNowRemoved = computed(() => globalStore.notifyCurrentSpaceIsNowRemoved)
const notifyThanksForDonating = computed(() => globalStore.notifyThanksForDonating)
const notifyThanksForUpgrading = computed(() => globalStore.notifyThanksForUpgrading)
const notifySpaceIsUnavailableOffline = computed(() => globalStore.currentSpaceIsUnavailableOffline)
const notifyIsJoiningGroup = computed(() => globalStore.notifyIsJoiningGroup)
const notifySignUpToJoinGroup = computed(() => globalStore.notifySignUpToJoinGroup)
const notifyIsDuplicatingSpace = computed(() => globalStore.notifyIsDuplicatingSpace)
const notifyBoxSnappingIsReady = computed(() => globalStore.notifyBoxSnappingIsReady)
const notifificationClasses = (item) => {
  const classes = {
    danger: item.type === 'danger',
    success: item.type === 'success',
    info: item.type === 'info',
    'persistent-item': item.isPersistentItem
  }
  return classes
}
const removePrevious = () => {
  globalStore.removePreviousNotification()
}
const removeById = (item) => {
  globalStore.removeNotificationById(item.id)
}

// new stuff

const changelogIsUpdated = computed(() => {
  if (!currentUserIsSignedIn.value) { return }
  return changelogStore.isUpdated
})
const latestChangelogPost = computed(() => {
  return changelogStore.updates[0]
})
const changeSpaceToChangelog = () => {
  const space = { id: consts.changelogSpaceId() }
  spaceStore.changeSpace(space)
  globalStore.addNotification({ message: 'Changelog space opened', type: 'success' })
}

// toggle notifications

const toggleNotifyCardsCreatedIsOverLimit = (value) => {
  state.notifyCardsCreatedIsOverLimitJiggle = true
}
const removeNotifyThanks = () => {
  globalStore.notifyThanksForDonating = false
  globalStore.notifyThanksForUpgrading = false
}
const update = async () => {
  await nextTick()
  const notifications = globalStore.notifications
  notifications.forEach(item => {
    const element = document.querySelector(`.notifications .item[data-notification-id="${item.id}"]`)
    if (!element) { return }
    if (element.dataset.isPersistentItem) { return }
    element.addEventListener('animationend', removePrevious, false)
  })
}
const removeNotifySpaceNotFound = () => {
  globalStore.updateNotifySpaceNotFound(false)
}
const removeNotifyConnectionError = () => {
  globalStore.updateNotifyConnectionError(false)
}

// buttons

const restoreSpace = () => {
  const space = spaceStore.getSpaceAllState
  spaceStore.restoreRemovedSpace(space)
  globalStore.notifySpaceIsRemoved = false
}
const deleteSpace = async () => {
  const space = spaceStore.getSpaceAllState
  spaceStore.deleteSpace(space)
  globalStore.notifySpaceIsRemoved = false
  const cachedSpaces = await cache.getAllSpaces()
  const firstSpace = cachedSpaces[0]
  spaceStore.loadSpace(firstSpace)
}
const resetNotifySpaceIsHidden = () => {
  globalStore.notifySpaceIsHidden = false
}
const resetNotifyCurrentSpaceIsNowRemoved = () => {
  globalStore.notifyCurrentSpaceIsNowRemoved = false
}
const triggerSpaceDetailsVisible = () => {
  globalStore.triggerSpaceDetailsVisible()
}
const triggerSignUpOrInIsVisible = () => {
  globalStore.triggerSignUpOrInIsVisible()
}
const showRemoved = () => {
  resetNotifyCurrentSpaceIsNowRemoved()
  globalStore.triggerRemovedIsVisible()
}
const resetNotifyCardsCreatedIsNearLimit = () => {
  globalStore.notifyCardsCreatedIsNearLimit = false
}
const resetNotifyMoveOrCopyToSpace = () => {
  globalStore.notifyMoveOrCopyToSpace = false
}
const resetNotifyCardsCreatedIsOverLimitJiggle = () => {
  state.notifyCardsCreatedIsOverLimitJiggle = false
}
const triggerUpgradeUserIsVisible = () => {
  closeAllDialogs()
  globalStore.triggerUpgradeUserIsVisible()
}
const refreshBrowser = () => {
  window.location.reload()
}
const updateChangelogAndRefreshBrowser = () => {
  cache.updatePrevReadChangelogId(latestChangelogPost.value.id)
  refreshBrowser()
}
const duplicateSpace = async () => {
  await spaceStore.duplicateSpace()
}
const changeSpace = (spaceId) => {
  const space = { id: spaceId }
  spaceStore.changeSpace(space)
  globalStore.closeAllDialogs()
}
const changeSpaceAndSelectItems = (spaceId, items) => {
  globalStore.multipleSelectedItemsToLoad(items)
  changeSpace(spaceId)
}
const dragToResizeIsVisible = computed(() => currentUserIsResizingCard.value || currentUserIsResizingBox.value)
const snapToGridIsVisible = computed(() => shouldSnapToGrid.value && !dragToResizeIsVisible.value)

// read-only jiggle

const addReadOnlyJiggle = () => {
  const element = readOnlyElement.value || templateElement.value
  if (!element) { return }
  state.readOnlyJiggle = true
  element.addEventListener('animationend', removeReadOnlyJiggle, false)
}
const removeReadOnlyJiggle = () => {
  state.readOnlyJiggle = false
}
</script>

<template lang="pug">
aside.notifications(@click.left="closeAllDialogs")
  .item(v-for="item in items" v-bind:key="item.id" :data-notification-id="item.id" :data-is-persistent-item="item.isPersistentItem" :class="notifificationClasses(item)")
    p
      .row(v-if="item.badge")
        span.badge.info {{ item.badge }}
      template(v-if="item.group")
        GroupLabel(:group="item.group")
      template(v-if="item.icon")
        img.icon(v-if="item.icon === 'open'" src="@/assets/open.svg" class="open")
        img.icon(v-else-if="item.icon === 'press-and-hold'" src="@/assets/press-and-hold.svg" class="press-and-hold")
        img.icon(v-else-if="item.icon === 'add'" src="@/assets/add.svg" class="add")
        img.icon(v-else-if="item.icon === 'cut'" src="@/assets/cut.svg" class="cut")
        img.icon(v-else-if="item.icon === 'undo'" src="@/assets/undo.svg" class="undo")
        img.icon(v-else-if="item.icon === 'redo'" src="@/assets/undo.svg" class="redo")
        img.icon(v-else-if="item.icon === 'brush-y'" src="@/assets/brush-y.svg" class="brush-y")
        img.icon(v-else-if="item.icon === 'minimap'" src="@/assets/minimap.svg" class="minimap")
        img.icon(v-else-if="item.icon === 'offline'" src="@/assets/offline.svg" class="offline")
        img.icon(v-else-if="item.icon === 'mail'" src="@/assets/mail.svg" class="mail")
        img.icon(v-else-if="item.icon === 'group'" src="@/assets/group.svg" class="group")
        img.icon(v-else-if="item.icon === 'comment'" src="@/assets/comment.svg" class="comment")
      span {{item.message}}
    .row(v-if="item.isPersistentItem")
      button.small-button(@click="removeById(item)")
        img.icon.cancel(src="@/assets/add.svg")

  .persistent-item.info(v-if="dragToResizeIsVisible")
    img.icon.resize(src="@/assets/resize.svg")
    span Drag to Resize
  .persistent-item.info(v-if="currentUserIsTiltingCard")
    img.icon.resize(src="@/assets/resize.svg")
    span Drag to Tilt

  .persistent-item.info(v-if="currentUserIsPaintingLocked && isTouchDevice")
    img.icon(src="@/assets/brush.svg")
    span Drag to Paint

  .persistent-item.info(v-if="currentUserIsPanningReady || currentUserIsPanning")
    img.icon(src="@/assets/hand.svg")
    span Drag to Pan

  .persistent-item.info(v-if="snapToGridIsVisible")
    img.icon(src="@/assets/constrain-axis.svg")
    span Snap to Grid

  .persistent-item.info(v-if="notifyBoxSnappingIsReady")
    img.icon(src="@/assets/box-snap.svg")
    span Snap to Box

  .persistent-item.success(v-if="notifyThanksForDonating")
    p Thank you for being a
      span
        .badge.info.is-donor Donor
      span , I deeply appreciate your support
    .row
      button(@click="removeNotifyThanks")
        img.icon.cancel(src="@/assets/add.svg")
        span Feels Good

  .persistent-item.success(v-if="notifyThanksForUpgrading")
    p Thank you for upgrading, I deeply appreciate your support
    .row
      button(@click="removeNotifyThanks")
        img.icon.cancel(src="@/assets/add.svg")
        span Feels Good

  .item.info(v-if="notifySpaceIsHidden" @animationend="resetNotifySpaceIsHidden")
    p Hidden spaces are revealed through
      img.icon.filter-icon(src="@/assets/filter.svg")

  .item.info(v-if="notifyCurrentSpaceIsNowRemoved" @animationend="resetNotifyCurrentSpaceIsNowRemoved")
    p Space was removed
    .row
      button(@click.stop="showRemoved")
        img.icon(src="@/assets/remove.svg")
        img.icon.remove-undo(src="@/assets/undo.svg")
        span Undo

  .item(v-if="notifyCardsCreatedIsNearLimit" @animationend="resetNotifyCardsCreatedIsNearLimit")
    p You can add {{cardsCreatedCountFromLimit}} more cards before you'll need to upgrade
    .row
      button(@click.left.stop="triggerUpgradeUserIsVisible") Upgrade for Unlimited

  .persistent-item.danger(v-if="notifyCardsCreatedIsOverLimit" ref="cardsOverLimitElement" :class="{'notification-jiggle': state.notifyCardsCreatedIsOverLimitJiggle}" @animationend="resetNotifyCardsCreatedIsOverLimitJiggle")
    p To add more cards, you'll need to upgrade
    .row
      button(@click.left.stop="triggerUpgradeUserIsVisible") Upgrade for Unlimited

  .persistent-item.success(v-if="notifySignUpToEditSpace" ref="readOnlyElement" :class="{'notification-jiggle': state.readOnlyJiggle}")
    p
      PrivacyIcon(:privacy="privacyState.name")
      button(@click.left.stop="triggerSignUpOrInIsVisible") Sign Up or In to Edit

  .persistent-item.danger(v-if="notifySpaceNotFound")
    p The space you tried to visit could not be found, or is private
    .row
      button(@click.left.stop="triggerSpaceDetailsVisible") Spaces
      button(v-if="!currentUserIsSignedIn" @click.left.stop="triggerSignUpOrInIsVisible") Sign Up or In
      button(@click.left="removeNotifySpaceNotFound")
        img.icon.cancel(src="@/assets/add.svg")

  .persistent-item(v-if="notifySpaceIsRemoved")
    p This space is removed
    .row
      button(@click.left="restoreSpace")
        img.icon(src="@/assets/undo.svg")
        span Restore
      button.danger(@click.left="deleteSpace")
        img.icon(src="@/assets/remove.svg")
        span Permanently Delete

  .persistent-item.danger(v-if="notifyConnectionError")
    .row
      p A server connection error has occured, please refresh
    .row
      p 🚒 Code: {{notifyConnectionErrorName}}
    .row
      .button-wrap
        a(href="mailto:support@kinopio.club?subject=Connection Error")
          button
            span Email Support
      .button-wrap
        button(@click.left="refreshBrowser")
          img.refresh.icon(src="@/assets/refresh.svg")
          span Refresh
      .button-wrap
        button(@click="removeNotifyConnectionError")
          img.icon.cancel(src="@/assets/add.svg")

  .persistent-item(v-if="changelogIsUpdated")
    p
      span.label-badge NEW
      span Kinopio updates are available
    .row
      span.badge.secondary {{latestChangelogPost.title}}
    .row
      .button-wrap
        button(@click.left="updateChangelogAndRefreshBrowser")
          img.refresh.icon(src="@/assets/refresh.svg")
          span Update

  .persistent-item.danger(v-if="state.notifiyCouldNotSave")
    p Error saving changes locally
    .row
      .button-wrap
        button(@click.left="refreshBrowser")
          img.refresh.icon(src="@/assets/refresh.svg")
          span Refresh

  .persistent-item.danger(v-if="notifyServerCouldNotSave")
    p Error saving changes to server
    .row
      .button-wrap
        button(@click.left="refreshBrowser")
          img.refresh.icon(src="@/assets/refresh.svg")
          span Refresh

  .persistent-item.danger(v-if="state.notifySpaceOutOfSync")
    p Space is out of sync, please refresh
    .row
      .button-wrap
        button(@click.left="refreshBrowser")
          img.refresh.icon(src="@/assets/refresh.svg")
          span Refresh

  .persistent-item.info(v-if="currentSpaceIsTemplate" ref="templateElement" :class="{'notification-jiggle': state.readOnlyJiggle}")
    button.button-only.small-button(@click.left="duplicateSpace")
      img.icon.duplicate(src="@/assets/duplicate.svg")
      span Duplicate Space

  .item.success(v-if="notifyMoveOrCopyToSpace" @animationend="resetNotifyMoveOrCopyToSpace")
    p {{notifyMoveOrCopyToSpaceDetails.message}}
    .row
      a(:href="notifyMoveOrCopyToSpaceDetails.id")
        button(@click.left.prevent.stop="changeSpaceAndSelectItems(notifyMoveOrCopyToSpaceDetails.id, notifyMoveOrCopyToSpaceDetails.items)") {{notifyMoveOrCopyToSpaceDetails.name}} →

  .persistent-item.danger(v-if="notifySpaceIsUnavailableOffline")
    OfflineBadge
    .row
      p
        span Space is unavailable offline.
    .row
      p Only spaces that you're a member of, and have visited recently, are available offline

  .persistent-item.info(v-if="notifyIsDuplicatingSpace")
    p
      Loader(:visible="true" :isSmall="true")
      span Duplicating Space…

  //- group

  .persistent-item(v-if="notifyIsJoiningGroup")
    p
      Loader(:visible="true" :isSmall="true")
      span Joining Group…

  .persistent-item(v-if="notifySignUpToJoinGroup" ref="readOnlyElement" :class="{'notification-jiggle': state.readOnlyJiggle}")
    .row
      p
        img.icon.group(src="@/assets/group.svg")
        span You've been invited to a group
    .row
      p
        button(@click.left.stop="triggerSignUpOrInIsVisible") Sign Up or In to Join Group

</template>

<style lang="stylus">
.notifications
  display flex
  flex-direction column
  align-items flex-start
  max-width 276px
  &:empty
    margin 0
  .item,
  .persistent-item
    pointer-events all
    box-shadow 3px 3px 0 var(--heavy-shadow)
    border-radius var(--entity-radius)
    margin-bottom 10px
    margin-right 0
    background-color var(--info-background)
    padding 5px 8px
    animation-name hideme
    animation-delay 5s
    animation-duration 0.1s
    animation-iteration-count 1
    animation-direction forward
    animation-fill-mode forwards
    animation-timing-function ease-out
    &.success
      background-color var(--success-background)
    &.danger
      background-color var(--danger-background)
    &:last-child
      margin-bottom 0
    p
      margin 0
      user-select text
  .persistent-item
    animation none
  .row
    margin-top 5px
    display flex
    align-items flex-end
    button
      &:first-child
        margin-left 0
  button
    margin-left 6px
  .button-only
    margin 0

  button + button,
  button + label,
  .button-wrap + .button-wrap
    margin-left 6px

  .hidden
    display none

  .notification-jiggle
    animation-name notificationJiggle
    animation-duration 0.2s
    animation-iteration-count 2
    animation-direction forward
    animation-fill-mode forwards
    animation-timing-function ease-out

  .label-badge
    position initial
    display inline-block
    color var(--primary-background)
    margin-right 6px
    font-size 10px
    vertical-align 1px

  .redo
    transform scaleX(-1)

  .icon.refresh
    vertical-align 0px

  .icon.resize
    vertical-align 2px

  .filter-icon
    margin 0
    margin-left 4px

  .badge
    &.is-donor
      margin 0
      margin-left 6px
      vertical-align 0

  .loader
    vertical-align -1.5px
    margin-right 6px

@keyframes notificationJiggle
  0%
    transform rotate(0deg)
  25%
    transform rotate(-3deg)
  50%
    transform rotate(2deg)
  75%
    transform rotate(-3deg)
  100%
    transform rotate(0deg)

@keyframes hideme
  from
    opacity 1
  to
    opacity 0
</style>
