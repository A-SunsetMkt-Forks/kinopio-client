<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, onUnmounted, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'
import { useApiStore } from '@/stores/useApiStore'

import SpaceList from '@/components/SpaceList.vue'
import Loader from '@/components/Loader.vue'
import UserLabelInline from '@/components/UserLabelInline.vue'
import utils from '@/utils.js'
import OfflineBadge from '@/components/OfflineBadge.vue'
import ResultsFilter from '@/components/ResultsFilter.vue'
import AddToExplore from '@/components/AddToExplore.vue'
import AskToAddToExplore from '@/components/AskToAddToExplore.vue'

import randomColor from 'randomcolor'

const globalStore = useGlobalStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()
const apiStore = useApiStore()

const dialogElement = ref(null)
const resultsElement = ref(null)

onMounted(() => {
  window.addEventListener('resize', updateHeights)
})

const props = defineProps({
  visible: Boolean,
  exploreSpaces: Array,
  followingSpaces: Array,
  everyoneSpaces: Array,
  loading: Boolean,
  unreadExploreSpacesCount: Number,
  unreadFollowingSpacesCount: Number,
  unreadEveryoneSpacesCount: Number,
  errorIsLoading: Boolean
})
watch(() => props.visible, (value, prevValue) => {
  globalStore.clearNotificationsWithPosition()
  state.tipsIsVisible = false
  if (value) {
    updateHeights()
    updateUserShowInExploreUpdatedAt()
  }
})

const state = reactive({
  dialogHeight: null,
  resultsSectionHeight: null,
  userShowInExploreDate: null,
  currentSection: 'explore', // 'explore', 'following', 'everyone'
  isReadSections: [], // 'explore', 'following', 'everyone'
  readSpaceIds: [],
  isLoadingExploreSearchResults: false,
  exploreSearchResults: [],
  tipsIsVisible: false
})

const currentSpace = computed(() => spaceStore.getSpaceAllState)
const changeSpace = (space) => {
  closeDialogs()
  spaceStore.changeSpace(space)
  state.readSpaceIds.push(space.id)
}
const closeDialogs = () => {
  // state.exploreRssFeedsIsVisible = false
}
const refreshBrowser = () => {
  window.location.reload()
}

// update height

const parentDialog = computed(() => 'explore')
const updateHeights = async () => {
  await nextTick()
  updateDialogHeight()
  updateResultsSectionHeight()
}
const updateDialogHeight = async () => {
  if (!props.visible) { return }
  await nextTick()
  const element = dialogElement.value
  state.dialogHeight = utils.elementHeightFromHeader(element)
}
const updateResultsSectionHeight = async () => {
  if (!props.visible) { return }
  await nextTick()
  const element = resultsElement.value
  state.resultsSectionHeight = utils.elementHeightFromHeader(element, true)
}

// unread sections

watch(() => state.currentSection, (value, prevValue) => {
  state.isReadSections.push(prevValue)
})
const isUnreadExplore = computed(() => {
  if (state.isReadSections.includes('explore')) {
    return false
  }
  return Boolean(props.unreadExploreSpacesCount)
})
const isUnreadFollowing = computed(() => {
  if (state.isReadSections.includes('following')) {
    return false
  }
  return Boolean(props.unreadFollowingSpacesCount)
})
const isUnreadEveryone = computed(() => {
  if (state.isReadSections.includes('everyone')) {
    return false
  }
  return Boolean(props.unreadEveryoneSpacesCount)
})

// current section

const updateCurrentSection = (value) => {
  state.currentSection = value
  updateHeights()
}
const currentSectionIsExplore = computed(() => state.currentSection === 'explore')
const currentSectionIsFollowing = computed(() => state.currentSection === 'following')
const currentSectionIsEveryone = computed(() => state.currentSection === 'everyone')
const currentSpaces = computed(() => {
  let spaces
  if (currentSectionIsExplore.value) {
    spaces = exploreSpaces.value
  } else if (currentSectionIsFollowing.value) {
    spaces = props.followingSpaces
  } else if (currentSectionIsEveryone.value) {
    spaces = props.everyoneSpaces
  }
  return spaces || []
})

// explore spaces

const currentSpaceInExplore = computed(() => currentSpace.value.showInExplore)
const updateUserShowInExploreUpdatedAt = async () => {
  state.userShowInExploreDate = userStore.showInExploreUpdatedAt
  let serverDate = await apiStore.getDate()
  serverDate = serverDate.date
  userStore.updateUser({ showInExploreUpdatedAt: serverDate })
}

// search explore spaces

const exploreSpaces = computed(() => {
  if (state.exploreSearchResults.length) {
    return state.exploreSearchResults
  } else {
    return props.exploreSpaces
  }
})
const updateFilter = async (value) => {
  if (!value) {
    state.exploreSearchResults = []
    state.isLoadingExploreSearchResults = false
    return
  }
  try {
    state.isLoadingExploreSearchResults = true
    const results = await apiStore.searchExploreSpaces({ query: value })
    state.exploreSearchResults = results
  } catch (error) {
    console.error('🚒 updateFilter', error, value)
  }
  state.isLoadingExploreSearchResults = false
}
const focusPreviousItem = () => {
  globalStore.triggerPickerNavigationKey('ArrowUp')
}
const focusNextItem = () => {
  globalStore.triggerPickerNavigationKey('ArrowDown')
}
const selectItem = () => {
  const liElement = resultsElement.value.querySelector('li.hover')
  if (!liElement) { return }
  const spaceId = liElement.dataset.spaceId
  changeSpace({ id: spaceId })
}

// blank slate info

const followInfoIsVisible = computed(() => {
  const isFavorites = Boolean(userStore.favoriteUsers.length || props.followingSpaces?.length)
  return !props.loading && !isFavorites && currentSectionIsFollowing.value
})
const randomUser = computed(() => {
  const luminosity = userStore.theme
  const color = randomColor({ luminosity })
  return { color, id: '123' }
})

// tips

const toggleTipsIsVisible = () => {
  state.tipsIsVisible = !state.tipsIsVisible
}

</script>

<template lang="pug">
dialog.explore.wide(v-if="visible" :open="visible" ref="dialogElement" :style="{'max-height': state.dialogHeight + 'px'}" @click.left.stop='closeDialogs')
  section(v-if="visible" :open="visible")
    .row.title-row
      .segmented-buttons
        button(:class="{active: currentSectionIsExplore}" @click="updateCurrentSection('explore')")
          img.icon.sunglasses(src="@/assets/sunglasses.svg")
          span Explore
          .badge.new-unread-badge.notification-button-badge(v-if="isUnreadExplore")
        button(:class="{active: currentSectionIsFollowing}" @click="updateCurrentSection('following')")
          span Following
          .badge.new-unread-badge.notification-button-badge(v-if="isUnreadFollowing")
        button(:class="{active: currentSectionIsEveryone}" @click="updateCurrentSection('everyone')")
          span Everyone
          .badge.new-unread-badge.notification-button-badge(v-if="isUnreadEveryone")
      button.small-button.extra-options-button(@click="toggleTipsIsVisible" :class="{active: state.tipsIsVisible}")
        span ?
    OfflineBadge
    .row(v-if="props.loading")
      Loader(:isSmall="true" :visible="props.loading")
    .row(v-if="props.errorIsLoading")
      .badge.danger
        p (シ_ _)シ Something went wrong, Please try again or contact support
        .button-wrap
          button(@click.left="refreshBrowser")
            img.refresh.icon(src="@/assets/refresh.svg")
            span Refresh

    //- tips
    section.subsection(v-if="state.tipsIsVisible")
      template(v-if="currentSectionIsExplore")
        p Explore is a list of cool spaces explicitly shared with the Kinopio community.
        p You can share your own spaces in Explore, or ask others to share theirs.
        AskToAddToExplore
        AddToExplore
      template(v-if="currentSectionIsFollowing")
        p Following lists recently updated public spaces created by people you Follow.
      template(v-if="currentSectionIsEveryone")
        p Everyone lists new public spaces created by the community.

    //- follow users blank slate
    section.subsection(v-if="followInfoIsVisible")
      p Follow other people to see their latest updates here
      p.badge.secondary
        UserLabelInline(:user="randomUser" :isClickable="false" :key="randomUser.id" :isSmall="true" :hideYouLabel="true")
        span → Follow

  hr

  section.results-section(ref="resultsElement" :style="{'max-height': state.resultsSectionHeight + 'px'}")
    ResultsFilter(
      :hideFilter="!currentSectionIsExplore"
      :showFilter="currentSectionIsExplore"
      :items="currentSpaces"
      :isLoading="state.isLoadingExploreSearchResults"

      @updateFilter="updateFilter"
      @focusPreviousItem="focusPreviousItem"
      @focusNextItem="focusNextItem"
      @selectItem="selectItem"
    )
    SpaceList(
      :spaces="currentSpaces"
      :showUser="true"
      @selectSpace="changeSpace"
      :userShowInExploreDate="state.userShowInExploreDate"
      :readSpaceIds="state.readSpaceIds"
      :spaceReadDateType="state.currentSection"
      :resultsSectionHeight="state.resultsSectionHeight"
      :parentDialog="parentDialog"
      :previewImageIsWide="true"
      :showCollaborators="true"
      :hideFilter="currentSectionIsExplore"
    )
</template>

<style lang="stylus">
dialog.explore
  top initial
  bottom 18px
  overflow auto
  position absolute
  &.wide
    width 320px
  .loader
    margin-right 5px
    vertical-align -2px
  .segmented-buttons
    button
      position relative
  hr
    margin-top 0
  .badge
    .button-wrap:last-child
      margin-bottom 4px
</style>
