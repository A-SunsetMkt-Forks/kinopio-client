<script setup>
import { reactive, computed, onMounted, onUnmounted, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'
import { useApiStore } from '@/stores/useApiStore'

import Loader from '@/components/Loader.vue'
import SpaceList from '@/components/SpaceList.vue'
import UserList from '@/components/UserList.vue'
import utils from '@/utils.js'
import User from '@/components/User.vue'

const globalStore = useGlobalStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()
const apiStore = useApiStore()

onMounted(() => {
  userStore.restoreUserAssociatedData()
})

const props = defineProps({
  visible: Boolean
})
watch(() => props.visible, (value, prevValue) => {
  if (!value) {
    updateFavoriteSpaceIsEdited()
  }
})

const state = reactive({
  spacesIsVisible: true,
  userDetailsPosition: {},
  currentUserSpacesIsVisible: true
})

const currentUser = computed(() => userStore.getUserAllState)
const favoriteUsers = computed(() => userStore.favoriteUsers)
const favoriteSpaces = computed(() => userStore.favoriteSpaces)
const loading = computed(() => globalStore.isLoadingFavorites)
const isEmpty = computed(() => {
  const noSpaces = state.spacesIsVisible && !favoriteSpaces.value.length
  const noPeople = !state.spacesIsVisible && !favoriteUsers.value.length
  if (noSpaces || noPeople) { return true }
  return false
})
const showSpaces = () => {
  state.spacesIsVisible = true
  closeDialogs()
}
const hideSpaces = () => {
  state.spacesIsVisible = false
  closeDialogs()
}

// spaces

const favoriteSpacesOrderedByEdited = computed(() => {
  let spaces = utils.clone(favoriteSpaces.value)
  spaces = spaces.map(space => {
    space.editedAt = space.editedAt || space.updatedAt || space.createdAt
    space.editedAt = new Date(space.editedAt)
    return space
  })
  spaces = spaces.sort((a, b) => b.editedAt - a.editedAt)
  return spaces
})
const filteredSapces = computed(() => {
  let spaces = favoriteSpacesOrderedByEdited.value
  if (!state.currentUserSpacesIsVisible) {
    spaces = spaces.filter(space => {
      const userId = space.userId || space.users[0].id
      const isUserId = userId === currentUser.value.id
      return !isUserId
    })
  }
  return spaces
})
const showCurrentUserSpaces = computed({
  get () {
    return state.currentUserSpacesIsVisible
  },
  set (newValue) {
    state.currentUserSpacesIsVisible = !state.currentUserSpacesIsVisible
  }
})
const currentUserSpacesFilterIsVisible = computed(() => {
  const spaces = favoriteSpacesOrderedByEdited.value
  const spacesIncludeCurrentUserSpace = spaces.find(space => space.userId === currentUser.value.id)
  return state.spacesIsVisible && spacesIncludeCurrentUserSpace
})
const checkIfShouldShowCurrentUserSpaces = (space) => {
  const isSpaceMember = userStore.getUserIsSpaceMember
  if (isSpaceMember) {
    state.currentUserSpacesIsVisible = true
  }
}
const isSpaceMemberOfCurrentSpace = computed(() => userStore.getUserIsSpaceMember)
const changeSpace = (space) => {
  spaceStore.changeSpace(space)
}
const parentDialog = computed(() => 'favorites')

// user

const userDetailsIsVisible = computed(() => globalStore.userDetailsIsVisible)
const userDetailsSelectedUser = computed(() => {
  if (!userDetailsIsVisible.value) { return }
  return globalStore.userDetailsUser
})
const toggleUserDetails = (event, user) => {
  const shouldShow = !globalStore.userDetailsIsVisible
  closeDialogs()
  if (shouldShow) {
    showUserDetails(event, user)
  }
}
const showUserDetails = async (event, user) => {
  const element = event.target
  const options = { element, shouldIgnoreZoom: true }
  const position = utils.childDialogPositionFromParent(options)
  globalStore.userDetailsUser = user
  globalStore.userDetailsPosition = position
  globalStore.userDetailsIsVisible = true
}
const closeDialogs = () => {
  globalStore.userDetailsIsVisible = false
}
const updateFavoriteSpaceIsEdited = async () => {
  const spaces = favoriteSpaces.value.filter(space => space.isEdited)
  if (!spaces.length) { return }
  spaces.forEach(space => {
    userStore.updateUserFavoriteSpaceIsEdited(space)
  })
  await apiStore.addToQueue({
    name: 'updateUserVisitSpaces',
    body: spaces
  })
}

</script>

<template lang="pug">
template(v-if="visible")
  section.favorites
    p
      span Favorites
      Loader(:visible="loading" :isSmall="true")
    .row.title-row
      .button-wrap
        .segmented-buttons
          button(@click.left.stop="showSpaces" :class="{ active: state.spacesIsVisible }")
            span Spaces
          button(@click.left.stop="hideSpaces" :class="{ active: !state.spacesIsVisible }")
            span People
      .button-wrap
        label.user-filter-button(v-if="currentUserSpacesFilterIsVisible" :class="{active: state.currentUserSpacesIsVisible}")
          input(type="checkbox" v-model="showCurrentUserSpaces")
          User(:user="currentUser"  :isClickable="false" :key="currentUser.id" :isSmall="true" :hideYouLabel="true")

  section.results-section(v-if="!isEmpty")
    //- Spaces
    template(v-if="state.spacesIsVisible")
      SpaceList(
        :spaces="filteredSapces"
        :showUser="true"
        @selectSpace="changeSpace"
        :parentDialog="parentDialog"
        :disableListOptimizations="true"
      )

    //- People
    template(v-if="!state.spacesIsVisible")
      UserList(:users="favoriteUsers" :selectedUser="userDetailsSelectedUser" @selectUser="toggleUserDetails")

  //- blank state
  section.favorites.tips-section(v-if="isEmpty && !loading")
    section.subsection
      p(v-if="state.spacesIsVisible")
        img.icon(src="@/assets/heart.svg")
        span Spaces to know when they've been updated
      p(v-if="!state.spacesIsVisible")
        span Follow people to see them here

</template>

<style lang="stylus">
.favorites
  overflow auto
  left initial
  right 8px
  .user-filter-button
    .user
      vertical-align -3px
  .loader
    margin-left 5px
    vertical-align -2px
  &.tips-section
    border none
    padding-top 0
  section.actions
    button
      .user-label-inline
        margin-right 0
        margin-left 5px
  .toggle-favorite-user
    .user-label-inline
      pointer-events none
</style>
