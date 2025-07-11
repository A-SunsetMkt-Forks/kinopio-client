<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, onUnmounted, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'
import { useGroupStore } from '@/stores/useGroupStore'

import templates from '@/data/templates.js'
import ResultsFilter from '@/components/ResultsFilter.vue'
import PrivacyIcon from '@/components/PrivacyIcon.vue'
import Loader from '@/components/Loader.vue'
import User from '@/components/User.vue'
import UserLabelInline from '@/components/UserLabelInline.vue'
import NameMatch from '@/components/NameMatch.vue'
import OfflineBadge from '@/components/OfflineBadge.vue'
import SpaceTodayBadge from '@/components/SpaceTodayBadge.vue'
import GroupLabel from '@/components/GroupLabel.vue'
import utils from '@/utils.js'
import cache from '@/cache.js'

import dayjs from 'dayjs'
import last from 'lodash-es/last'

const globalStore = useGlobalStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()
const groupStore = useGroupStore()

let unsubscribes

let shouldPreventSelectSpace

const itemsPerPage = 60

const spaceListElement = ref(null)

onMounted(() => {
  updateScroll()
  spaceListElement.value.closest('section').addEventListener('scroll', updateScroll)
  if (props.disableListOptimizations) {
    state.currentPage = totalPages.value
  }

  const globalActionUnsubscribe = globalStore.$onAction(
    ({ name, args }) => {
      if (name === 'triggerPickerNavigationKey') {
        const key = args[0]
        const spaces = props.spaces
        const currentIndex = spaces.findIndex(space => space.id === state.focusOnId)
        if (!utils.arrayHasItems(spaces)) {
          closeDialog()
        } else if (key === 'ArrowUp') {
          focusPreviousItem(currentIndex)
        } else if (key === 'ArrowDown') {
          focusNextItem(currentIndex)
        }
      } else if (name === 'triggerPickerSelect') {
        const spaces = props.spaces
        const currentSpace = spaces.find(space => space.id === state.focusOnId)
        selectSpace(null, currentSpace)
        globalStore.shouldPreventNextEnterKey = true
      }
    }
  )
  const spaceActionUnsubscribe = spaceStore.$onAction(
    ({ name, args }) => {
      if (name === 'restoreSpace') {
        state.focusOnId = spaceStore.id
      }
    }
  )
  unsubscribes = () => {
    globalActionUnsubscribe()
    spaceActionUnsubscribe()
  }
})

onBeforeUnmount(() => {
  spaceListElement.value.closest('section').removeEventListener('scroll', updateScroll)
  if (unsubscribes) {
    unsubscribes()
  }
})

const emit = defineEmits(['focusBeforeFirstItem', 'closeDialog', 'selectSpace'])

const props = defineProps({
  spaces: Array,
  selectedSpace: Object,
  showCategory: Boolean,
  showUser: Boolean,
  showOtherUsers: Boolean,
  showCollaborators: Boolean,
  showUserIfCurrentUserIsCollaborator: Boolean,
  hideExploreBadge: Boolean,
  hideFilter: Boolean,
  showFilter: Boolean,
  isLoading: Boolean,
  parentIsSpaceDetails: Boolean,
  parentIsPinned: Boolean,
  userShowInExploreDate: String,
  readSpaceIds: Array,
  spaceReadDateType: String,
  showCreateNewSpaceFromSearch: Boolean,
  resultsSectionHeight: Number,
  disableListOptimizations: Boolean,
  search: String,
  parentDialog: String,
  previewImageIsWide: Boolean,
  hidePreviewImage: Boolean,
  showSpaceGroups: Boolean,
  showDuplicateTemplateIcon: Boolean
})

const state = reactive({
  filter: '',
  filteredSpaces: [],
  focusOnId: '',
  scrollY: 0,
  currentPage: 1,
  prevScrollAreaHeight: 0
})

const isOnline = computed(() => globalStore.isOnline)
const isOffline = computed(() => !isOnline.value)
const currentUser = computed(() => userStore.getUserAllState)

// spaces

watch(() => props.spaces, (spaces) => {
  const cardDetailsIsVisible = globalStore.cardDetailsIsVisibleForCardId
  if (spaces && cardDetailsIsVisible) {
    state.focusOnId = props.spaces[0].id
  }
}, { deep: true })

const spacesFiltered = computed(() => {
  let spaces = props.spaces
  if (state.filter) {
    spaces = state.filteredSpaces
  }
  spaces = spaces.filter(space => space.id)
  return spaces
})
const isNotCached = (spaceId) => {
  return spaceStore.getSpaceIsNotCached(spaceId)
}
const isNew = (space) => {
  if (props.readSpaceIds?.includes(space.id)) { return }
  if (props.userShowInExploreDate) {
    if (spaceIsCurrentSpace(space)) { return }
    const readDate = dayjs(props.userShowInExploreDate)
    const spaceDate = utils.spaceReadDate(space, props.spaceReadDateType)
    const delta = readDate.diff(spaceDate, 'second')
    return delta < 0
  }
  const isEditedByOtherUser = space.editedByUserId !== currentUser.value.id
  if (isEditedByOtherUser) {
    return space.isEdited
  } else {
    return false
  }
}
const categoryClassName = (space) => {
  const className = utils.normalizeString(space.category)
  return className
}
const spaceIsActive = (space) => {
  if (props.selectedSpace) {
    return Boolean(props.selectedSpace.id === space.id)
  } else {
    return spaceIsCurrentSpace(space)
  }
}
const spaceIsHidden = (space) => {
  const isHidden = spaceStore.getSpaceIsHiddenById(space.id)
  return isHidden
}
const isLoadingSpace = (space) => {
  const isLoadingSpace = globalStore.isLoadingSpace
  return isLoadingSpace && spaceIsCurrentSpace(space)
}
const spaceIsCurrentSpace = (space) => {
  const currentSpace = spaceStore.id
  return Boolean(currentSpace === space.id)
}
const spaceIsTemplate = (space) => {
  if (space.isTemplate) { return true }
  const templateSpaceIds = templates.spaces().map(template => template.id)
  return templateSpaceIds.includes(space.id)
}
const showInExplore = (space) => {
  if (props.hideExploreBadge) { return }
  if (space.privacy === 'private') { return }
  return space.showInExplore
}
const user = (space) => {
  let users = []
  if (utils.arrayHasItems(space.users)) {
    users = space.users
  }
  return space.user || users[0]
}
const users = (space) => {
  const spaceUser = user(space)
  let spaceUsers = [spaceUser]
  if (space.otherUsers) {
    spaceUsers = spaceUsers.concat(space.otherUsers)
  } else if (space.collaborators) {
    spaceUsers = spaceUsers.concat(space.collaborators)
  }
  return spaceUsers
}
const isMultipleUsers = (space) => {
  return users(space).length > 1
}
const showUserIfCurrentUserIsCollaborator = (space) => {
  const isUser = Boolean(user(space))
  return props.showUserIfCurrentUserIsCollaborator && space.currentUserIsCollaborator && isUser
}
const selectSpace = (event, space) => {
  if (event) {
    if (event.metaKey || event.ctrlKey) {
      return
    } else {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  if (shouldPreventSelectSpace) {
    shouldPreventSelectSpace = false
    return
  }
  if (!space) { return }
  globalStore.updateNotifySpaceNotFound(false)
  emit('selectSpace', space)
}

// favorites

const isFavorite = (space) => {
  return spaceStore.getSpaceIsFavorite(space.id)
}

// scroll

watch(() => props.resultsSectionHeight, async (value, prevValue) => {
  await nextTick()
  updateScroll()
})
watch(() => props.isLoading, async (value, prevValue) => {
  await nextTick()
  updateScroll()
})
const updateScroll = async () => {
  await nextTick()
  let element = spaceListElement.value
  if (!element) { return }
  element = element.closest('section')
  if (!element) {
    console.error('scroll element not found', element)
  }
  state.scrollY = element.scrollTop
  const scrollHeight = element.getBoundingClientRect().height
  let minItemHeight = 37.5
  if (props.previewImageIsWide) {
    minItemHeight = 42
  }
  state.pageHeight = itemsPerPage * minItemHeight * state.currentPage
  updateCurrentPage()
}

// list render optimization

const updateCurrentPage = () => {
  const zoom = utils.pinchCounterZoomDecimal()
  const threshold = 600
  const nearBottomY = state.pageHeight - (threshold * state.currentPage)
  const isNextPage = (state.scrollY * zoom) > nearBottomY
  if (isNextPage) {
    state.currentPage = Math.min(state.currentPage + 1, totalPages.value)
  }
}
const totalPages = computed(() => {
  const items = spacesFiltered.value
  const total = Math.ceil(items.length / itemsPerPage)
  return total
})
const itemsRendered = computed(() => {
  let items = spacesFiltered.value
  const max = state.currentPage * itemsPerPage
  items = items.slice(0, max)
  return items
})

// results filter

const placeholder = computed(() => {
  if (!props.parentIsSpaceDetails) { return }
  let placeholder = 'Search Spaces'
  if (!utils.isMobile()) {
    placeholder = placeholder + ` (${utils.metaKey()}-K)`
  }
  return placeholder
})
const updateFilteredSpaces = (spaces) => {
  state.filteredSpaces = spaces
}
const parentDialog = computed(() => {
  const cardDetailsIsVisible = globalStore.cardDetailsIsVisibleForCardId
  let parentDialog = props.parentDialog
  if (cardDetailsIsVisible) {
    parentDialog = 'cardDetails'
  }
  return parentDialog
})
const updateFilter = async (filter, isClearFilter) => {
  const parentIsNew = parentDialog.value !== globalStore.spaceListFilterInfo.parentDialog
  if (parentIsNew) {
    filter = ''
  }
  state.filter = filter
  if (!isClearFilter) {
    globalStore.spaceListFilterInfo = {
      filter,
      parentDialog: parentDialog.value,
      updatedAt: new Date().getTime()
    }
  }
  const spaces = spacesFiltered.value || props.spaces
  if (!spaces.length) { return }
  if (!filter) {
    state.focusOnId = ''
    await nextTick()
    updateScroll()
    return
  }
  state.focusOnId = spaces[0].id
}

// keyboard focus

const focusPreviousItem = (currentIndex) => {
  const spaces = spacesFiltered.value
  const focusedSpaceName = props.spaces.find(space => space.id === state.focusOnId)
  const firstItemIsFocused = props.search === focusedSpaceName
  const firstItem = spaces[0]
  const previousItem = spaces[currentIndex - 1]
  if (firstItemIsFocused) {
    closeDialog()
  } else if (previousItem) {
    state.focusOnId = previousItem.id
  } else {
    state.focusOnId = firstItem.id
    emit('focusBeforeFirstItem')
  }
}
const focusNextItem = (currentIndex) => {
  const spaces = spacesFiltered.value
  const lastItem = last(spaces)
  const lastItemIsFocused = lastItem.name === state.focusOnId
  const nextItem = spaces[currentIndex + 1]

  if (lastItemIsFocused) {
    closeDialog()
  } else if (nextItem) {
    state.focusOnId = nextItem.id
  } else {
    state.focusOnId = lastItem.id
  }
}
const closeDialog = () => {
  emit('closeDialog')
}
const focusNextItemFromFilter = () => {
  const spaces = spacesFiltered.value
  const currentIndex = spaces.findIndex(space => space.id === state.focusOnId)
  focusNextItem(currentIndex)
}
const focusPreviousItemFromFilter = () => {
  const spaces = spacesFiltered.value
  const currentIndex = spaces.findIndex(space => space.id === state.focusOnId)
  focusPreviousItem(currentIndex)
}
const selectItemFromFilter = () => {
  if (shouldPreventSelectSpace) {
    shouldPreventSelectSpace = false
    return
  }
  const spaces = spacesFiltered.value
  const space = spaces.find(space => space.id === state.focusOnId)
  globalStore.shouldPreventNextEnterKey = true
  selectSpace(null, space)
}

// group

const group = (groupId) => {
  if (!groupId) { return }
  return groupStore.getGroup(groupId)
}
</script>

<template lang="pug">
span.space-list-wrap
  ResultsFilter(
    :hideFilter="hideFilter"
    :showFilter="showFilter"
    :items="spaces"
    :placeholder="placeholder"
    :isLoading="isLoading"
    :parentIsPinned="parentIsPinned"
    :showCreateNewSpaceFromSearch="showCreateNewSpaceFromSearch"
    :isInitialValueFromSpaceListFilterInfo="true"
    @updateFilter="updateFilter"
    @updateFilteredItems="updateFilteredSpaces"
    @focusNextItem="focusNextItemFromFilter"
    @focusPreviousItem="focusPreviousItemFromFilter"
    @selectItem="selectItemFromFilter"
  )
  ul.results-list.space-list(ref="spaceListElement")
    .prev-scroll-area-height(:style="{height: state.prevScrollAreaHeight + 'px'}")
    template(v-for="(space, index) in itemsRendered" :key="space.id")
      .space-wrap(:data-space-id="space.id")
        a(:href="space.url")
          li(
            @click.left="selectSpace($event, space)"
            :class="{ active: spaceIsActive(space), hover: state.focusOnId === space.id, 'space-is-hidden': spaceIsHidden(space) }"
            tabindex="0"
            @keyup.enter="selectSpace(null, space)"
            :data-created-at="space.createdAt"
            :data-updated-at="space.updatedAt"
            :data-space-id="space.id"
          )
            Loader(:visible="isLoadingSpace(space)")
            //- offline
            span(v-if="isOffline && isNotCached(space.id)")
              OfflineBadge(:isInline="true" :isDanger="true")
            //- favorite
            template(v-if="isFavorite(space)")
              img.icon.favorite-icon(src="@/assets/heart.svg")
            //- inbox
            template(v-if="space.name === 'Inbox'")
              img.icon.inbox-icon(src="@/assets/inbox.svg")
            //- template
            template(v-if="space.isTemplate")
              img.icon.templates.duplicate-template(v-if="showDuplicateTemplateIcon" src="@/assets/duplicate.svg" title="Duplicate Template")
              img.icon.templates(v-else src="@/assets/templates.svg" title="Template")
            //- Users
            //- show spectators
            template(v-if="showOtherUsers && isMultipleUsers(space)")
              .users.multiple-users
                template(v-for="user in users(space)" :key="user.id")
                  User(:user="user" :isClickable="false" :isMedium="true")
            template(v-else-if="showOtherUsers")
              UserLabelInline(:user="user(space)" :isClickable="false" :key="user(space).id" :isMedium="true" :truncateNameToLength="7")
            //- show collaborators
            template(v-else-if="showCollaborators && isMultipleUsers(space)")
              .users.multiple-users
                template(v-for="user in users(space)" :key="user.id")
                  User(:user="user" :isClickable="false" :isMedium="true")
            template(v-else-if="showCollaborators")
              UserLabelInline(:user="user(space)" :isClickable="false" :key="user(space).id" :isMedium="true" :truncateNameToLength="7")
            //- show user badge only
            template(v-else-if="showUser")
              User(:user="user(space)" :isClickable="false" :key="user(space).id" :isMedium="true")
            //- show user when current user is collaborator
            template(v-else-if="showUserIfCurrentUserIsCollaborator(space)")
              User(:user="user(space)" :isClickable="false" :key="user(space).id" :isMedium="true")

            //- preview image
            template(v-if="!props.hidePreviewImage")
              .preview-thumbnail-image-wrap(v-if="space.previewThumbnailImage && isOnline" :class="{wide: previewImageIsWide}")
                img.preview-thumbnail-image(:src="space.previewThumbnailImage" loading="lazy")
            //- group
            template(v-if="group(space.groupId) && props.showSpaceGroups")
              GroupLabel(:group="group(space.groupId)")
            //- template category
            .badge.info.inline-badge(v-if="showCategory && space.category" :class="categoryClassName(space)") {{space.category}}
            //- today
            SpaceTodayBadge(:space="space")
            //- space details
            .name
              span(v-if="state.filter")
                NameMatch(:name="space.name" :indexes="space.matchIndexes")
              span(v-else)
                span {{space.name}}
              template(v-if='space.privacy')
                PrivacyIcon(:privacy="space.privacy" :closedIsNotVisible="true")
              img.icon.sunglasses(src="@/assets/sunglasses.svg" v-if="showInExplore(space)" title="Shown in Explore")
            //- new
            .badge.info.inline-badge.new-unread-badge(v-if="isNew(space)")
</template>

<style lang="stylus">
.space-list-wrap
  position relative

  .space-list
    .inline-badge
      margin-left 0
      flex none

    .badge
      margin-left 0

    .sunglasses
      width 16px

    .icon
      flex-shrink 0

    .name
      margin 0
      margin-top 1px
      white-space wrap
      width 100%
      .icon
        margin-left 6px

    .privacy-icon
      height 12px
      vertical-align -1px

    .favorite-icon
    .inbox-icon
      margin-right 5px
      width 12px
      vertical-align -2px
      margin-top 6px
    .icon.group
      width initial
      height 10px

    .user
      margin-right 6px
      vertical-align middle
    .user-label-inline
      flex-shrink 0
      max-width 100px
      pointer-events none
    .users
      margin-right 6px
      display flex
      flex-wrap wrap
      align-content flex-start
      flex-shrink 0
      max-width 66px // 3 users across
      .user
        margin-right 0
    a
      color var(--primary)
      text-decoration none

    .color-only-badge
      width 16px
      height 16px
      padding 0
      min-width initial
      min-height initial

    li
      position relative
      width 100%
      min-height 30px
      padding-bottom 5px
      .loader
        position absolute
        width 13px
        height 13px
        top 10px
        z-index 1
      .icon.templates
        margin-right 5px
        margin-top 3px
      .icon.duplicate-template
        margin-top 5px

    .space-wrap
      position relative
      button.inline-favorite
        cursor pointer
        z-index 1
        padding 0
        padding-left 6px
        padding-right 2px
    .inline-favorite-wrap
      cursor pointer
      position absolute
      right 4px
      top 3px
      padding 6px
      padding-right 0

    .preview-thumbnail-image-wrap
      position relative
      flex-shrink 0
      margin-right 6px
      &.wide
        width 40px
        height 30px
        .preview-thumbnail-image
          width 100%
          height 100%

</style>
