<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useCardStore } from '@/stores/useCardStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'
import { useApiStore } from '@/stores/useApiStore'

import ResultsFilter from '@/components/ResultsFilter.vue'
import ColorPicker from '@/components/dialogs/ColorPicker.vue'
import SpaceCardList from '@/components/SpaceCardList.vue'
import Loader from '@/components/Loader.vue'
import utils from '@/utils.js'
import cache from '@/cache.js'

import uniqBy from 'lodash-es/uniqBy'
import sortBy from 'lodash-es/sortBy'
import dayjs from 'dayjs'

const globalStore = useGlobalStore()
const cardStore = useCardStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()
const apiStore = useApiStore()

const dialogElement = ref(null)
const resultsElement = ref(null)

onMounted(() => {
  window.addEventListener('scroll', updatePosition)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', updatePosition)
})

const state = reactive({
  colorPickerIsVisible: false,
  filter: '',
  filteredCards: [],
  loading: false,
  cards: [],
  dialogHeight: null,
  resultsSectionHeight: null,
  newPosition: {},
  cachedSpaces: []
})

const visible = computed(() => globalStore.tagDetailsIsVisible)
watch(() => visible.value, (value, prevValue) => {
  if (!value) {
    globalStore.tagDetailsPositionShouldUpdate = false
    closeDialogs()
  }
})
const canEditSpace = computed(() => userStore.getUserCanEditSpace)
const currentSpaceId = computed(() => spaceStore.id)
const currentUserIsSignedIn = computed(() => userStore.getUserIsSignedIn)
const currentUser = computed(() => userStore.getUserAllState)
const isDark = computed(() => utils.colorIsDark(color.value))

// current tag

const currentTag = computed(() => {
  // name, color, cardId
  const tag = globalStore.currentSelectedTag
  if (tag.spaceId) {
    return tag
  } else {
    return spaceStore.getSpaceTagByName(tag.name)
  }
})
watch(() => currentTag.value, async (tag, prevValue) => {
  if (tag && visible.value) {
    state.newPosition = {}
    updateCards()
    updatePinchCounterZoomDecimal()
    closeDialogs()
    await nextTick()
    scrollIntoView()
  }
})
const color = computed(() => {
  if (!currentTag.value) { return }
  return currentTag.value.color
})
const name = computed(() => {
  if (!currentTag.value) { return }
  return currentTag.value.name
})

// styles and position

const pinchCounterZoomDecimal = computed(() => globalStore.pinchCounterZoomDecimal)
const updatePinchCounterZoomDecimal = () => {
  globalStore.pinchCounterZoomDecimal = utils.pinchCounterZoomDecimal()
}
const visibleFromTagList = computed(() => globalStore.tagDetailsIsVisibleFromTagList)
const position = computed(() => {
  if (utils.objectHasKeys(state.newPosition)) {
    return state.newPosition
  } else {
    return globalStore.tagDetailsPosition
  }
})
const styles = computed(() => {
  const isChildDialog = cardDetailsIsVisibleForCardId.value || visibleFromTagList.value
  let zoom = globalStore.getSpaceZoomDecimal
  if (isChildDialog) {
    zoom = 1
  }
  const x = zoom * position.value.x
  const y = zoom * position.value.y
  let scale
  if (utils.isSignificantlyPinchZoomed()) {
    scale = pinchCounterZoomDecimal.value
  }
  return {
    left: `${x}px`,
    top: `${y}px`,
    transform: `scale(${scale})`,
    maxHeight: state.dialogHeight + 'px'
  }
})
const updatePosition = () => {
  if (!globalStore.tagDetailsPositionShouldUpdate) { return }
  const origin = globalStore.tagDetailsPosition
  const delta = {
    x: window.scrollX - origin.pageX,
    y: window.scrollY - origin.pageY
  }
  state.newPosition = {
    x: origin.x + delta.x,
    y: origin.y + delta.y
  }
}
const closeDialogs = () => {
  state.colorPickerIsVisible = false
}
const scrollIntoView = async () => {
  await nextTick()
  const element = dialogElement.value
  if (!element) { return }
  globalStore.scrollElementIntoView({ element })
}
const updateResultsSectionHeight = async () => {
  if (!visible.value) { return }
  await nextTick()
  const element = resultsElement.value
  state.resultsSectionHeight = utils.elementHeight(element) - 2
}
const updateDialogHeight = async () => {
  await nextTick()
  const element = dialogElement.value
  state.dialogHeight = utils.elementHeight(element)
  updateResultsSectionHeight()
}

// spaces

const cachedOrOtherSpaceById = async (spaceId) => {
  const currentSpace = spaceStore.getSpaceAllState
  const cachedSpace = await cache.space(spaceId)
  if (spaceId === currentSpace.id) {
    return utils.clone(currentSpace)
  } else if (utils.objectHasKeys(cachedSpace)) {
    return cachedSpace
  } else {
    return globalStore.getOtherSpaceById(spaceId)
  }
}

// current card

const cardDetailsIsVisibleForCardId = computed(() => globalStore.cardDetailsIsVisibleForCardId)
const currentCard = computed(() => {
  const currentCardId = cardDetailsIsVisibleForCardId.value
  const card = cardStore.getCard(currentCardId)
  const tagCard = cardStore.getCard(globalStore.currentSelectedTag.cardId)
  return card || tagCard
})
const showEditCard = computed(() => !cardDetailsIsVisibleForCardId.value && !visibleFromTagList.value)
const focusOnCard = async (card) => {
  card = card || currentCard.value
  globalStore.closeAllDialogs()
  const isCurrentSpace = currentSpaceId.value !== card.spaceId
  if (isCurrentSpace) {
    globalStore.loadSpaceFocusOnCardId = card.id
    let space
    if (card.spaceId) {
      space = { id: card.spaceId }
    } else {
      space = await cache.space(card.spaceId)
    }
    spaceStore.changeSpace(space)
  } else {
    const cardId = card.id || currentTag.value.cardId
    globalStore.updateFocusOnCardId(cardId)
  }
}
const showCardDetails = () => {
  const cardId = currentCard.value.id
  globalStore.closeAllDialogs()
  cardStore.showCardDetails(cardId)
}

// update cards

const remoteCards = async () => {
  let remoteCardsList = []
  state.loading = true
  try {
    let cards
    cards = await apiStore.getCardsWithTag(name.value) || []
    cards = utils.clone(cards)
    cards = sortBy(cards, card => dayjs(card.updatedAt).valueOf())
    cards = cards.reverse()
    remoteCardsList = remoteCardsList.concat(cards)
  } catch (error) {
    console.warn('🚑 could not find cards with tag', name.value, error)
    state.loading = false
  }
  state.loading = false
  return remoteCardsList
}
const updateCards = async () => {
  state.cards = []
  const cardsInCurrentSpace = cardStore.getCardsWithTagName(name.value)
  const cardsInCachedSpaces = await cache.allCardsByTagName(name.value)
  // cache cards
  let cacheCards = cardsInCurrentSpace.concat(cardsInCachedSpaces)
  cacheCards = addCardNameSegments(cacheCards)
  updateCardsList(cacheCards)
  // remote cards
  let remoteCardsList = await remoteCards()
  if (remoteCardsList.length) {
    remoteCardsList = addCardNameSegments(remoteCardsList)
    remoteCardsList = remoteCardsList.filter(card => card.isRemoved !== true)
    updateCardsList(remoteCardsList)
  }
}
const updateCardsWithTagColor = (name, newColor) => {
  const cards = state.cards.map(card => {
    card.nameSegments = card.nameSegments.map(segment => {
      if (segment.isTag && segment.name === name) {
        segment.color = newColor
      }
      return segment
    })
    return card
  })
  updateCardsList(cards)
}
const updateTagColorByName = (newColor) => {
  const tag = utils.clone(currentTag.value)
  tag.color = newColor
  spaceStore.updateTagColorByName(tag)
  updateCardsWithTagColor(tag.name, newColor)
}

// update tags

const toggleColorPicker = () => {
  state.colorPickerIsVisible = !state.colorPickerIsVisible
}
const removeTag = () => {
  spaceStore.removeTags(currentTag.value)
}

// cards list

const groupedItems = computed(() => {
  let groups = []
  filteredItems.value.forEach(item => {
    const groupIndex = groups.findIndex(group => group.spaceId === item.spaceId)
    if (groupIndex !== -1) {
      groups[groupIndex].cards.push(item)
    } else {
      let spaceName, background, backgroundTint
      const spaceId = item.spaceId || currentSpaceId.value
      const space = state.cachedSpaces.find(cachedspace => cachedspace.id === spaceId)
      if (space) {
        spaceName = space.name
        background = space.background
        backgroundTint = space.backgroundTint
      }
      groups.push({
        spaceName: spaceName || item.spaceName,
        spaceId,
        cards: [item],
        space,
        background,
        backgroundTint
      })
    }
  })
  groups = sortCurrentSpaceIsFirst(groups)
  groups = sortCurrentCardIsFirst(groups)
  return groups
})
const selectCardsWithTag = () => {
  const cards = cardStore.getCardsWithTagName(currentTag.value.name)
  const cardIds = cards.map(card => card.id)
  globalStore.closeAllDialogs()
  globalStore.multipleCardsSelectedIds = cardIds
}
const sortCurrentSpaceIsFirst = (groups) => {
  const currentSpaceGroup = groups.find(group => group.spaceId === currentSpaceId.value)
  if (!currentSpaceGroup) { return groups }
  groups = groups.filter(group => group.spaceId !== currentSpaceId.value)
  groups.unshift(currentSpaceGroup)
  return groups
}
const sortCurrentCardIsFirst = (groups) => {
  if (!currentCard.value) { return groups }
  const currentCardItem = groups[0].cards.find(card => card.id === currentCard.value.id)
  if (!currentCardItem) { return groups }
  const cards = groups[0].cards.filter(card => card.id !== currentCardItem.id)
  cards.unshift(currentCardItem)
  groups[0].cards = cards
  return groups
}
const segmentTagColor = (segment) => {
  if (name.value === segment.name) {
    return color.value
  }
  const spaceTag = spaceStore.getSpaceTagByName(segment.name)
  const userTag = userStore.getUserTagByName(segment.name)
  if (spaceTag) {
    return spaceTag.color
  } else if (userTag) {
    return userTag.color
  } else {
    return currentUser.value.color
  }
}
const addCardNameSegments = (cards) => {
  return cards.map(card => {
    card.nameSegments = cardNameSegments(card.name)
    return card
  })
}
const cardNameSegments = (name) => {
  const url = utils.urlFromString(name)
  let imageUrl
  if (utils.urlIsImage(url)) {
    imageUrl = url
    name = name.replace(url, '')
  }
  const segments = utils.cardNameSegments(name)
  if (imageUrl) {
    segments.unshift({
      isImage: true,
      url: imageUrl
    })
  }
  return segments.map(segment => {
    if (!segment.isTag) { return segment }
    segment.color = segmentTagColor(segment)
    return segment
  })
}
const updateCardsList = async (cards) => {
  cards = cards.filter(card => {
    const cardTags = utils.tagsFromStringWithoutBrackets(card.name) || []
    return cardTags.includes(name.value)
  })
  cards = state.cards.concat(cards)
  cards = uniqBy(cards, 'id')
  state.cards = cards
  await nextTick()
  await nextTick() // double nextTick to avoid timing conflicts with TagList updatePosition()
  updateDialogHeight()
}
const appendToCardsList = (cards) => {
  const newCardIds = cards.map(card => card.id)
  state.cards = state.cards.filter(card => !newCardIds.includes(card.id))
  state.cards = state.cards.concat(cards)
  updateDialogHeight()
}

// filter

const filteredItems = computed(() => {
  if (state.filter) {
    return state.filteredCards
  } else {
    return state.cards
  }
})
watch(() => filteredItems.value, async (items, prevValue) => {
  const spaces = []
  for (const item of items) {
    const spaceId = item.spaceId || currentSpaceId.value
    const space = await cachedOrOtherSpaceById(spaceId)
    if (space) {
      spaces.push(space)
    }
  }
  state.cachedSpaces = spaces
})

const shouldHideResultsFilter = computed(() => {
  if (state.cards.length < 5) {
    return true
  } else {
    return false
  }
})
const isFilteredInSpace = computed({
  get () {
    const tags = globalStore.filteredTagNames
    return tags.includes(currentTag.value.name)
  },
  set () {
    toggleFilteredInSpace()
  }
})
const toggleFilteredInSpace = () => {
  const filtered = globalStore.filteredTagNames
  const tagName = currentTag.value.name
  if (filtered.includes(tagName)) {
    globalStore.removeFromFilteredTagNames(tagName)
  } else {
    globalStore.addToFilteredTagNames(tagName)
  }
}
const updateFilter = (filter) => {
  state.filter = filter
}
const updateFilteredCards = (cards) => {
  state.filteredCards = cards
}

// space

const spaceIsCurrentSpace = (spaceId) => {
  return spaceId === currentSpaceId.value
}
const changeSpace = (spaceId) => {
  globalStore.closeAllDialogs()
  if (spaceIsCurrentSpace(spaceId)) { return }
  const space = { id: spaceId }
  spaceStore.changeSpace(space)
}

</script>

<template lang="pug">
dialog.tag-details(v-if="visible" :open="visible" :style="styles" ref="dialogElement" @click.left.stop="closeDialogs")
  section.edit-card(v-if="showEditCard")
    button(@click="showCardDetails")
      span Edit Card
    button.change-color.select-all(@click="selectCardsWithTag")
      .current-color(:style="{backgroundColor: color}")
      span Select All
  section(:style="{backgroundColor: color}" :class="{'is-dark': isDark}")
    .row.tag-title-row
      .row
        .button-wrap
          button.change-color(:disabled="!canEditSpace" @click.left.stop="toggleColorPicker" :class="{active: state.colorPickerIsVisible}")
            .current-color(:style="{backgroundColor: color}")
          ColorPicker(:currentColor="color" :visible="state.colorPickerIsVisible" @selectedColor="updateTagColorByName")
        .tag-name {{name}}
      //- Filter
      .button-wrap
        button.small-button(@click.left.prevent="toggleFilteredInSpace" @keydown.stop.enter="toggleFilteredInSpace" :class="{active: isFilteredInSpace}")
          img.icon(src="@/assets/filter.svg")

    //- no cards found
    template(v-if="!state.cards.length && !state.loading")
      p.no-cards Tag more cards with [[{{currentTag.name}}]] to see them here
      button(v-if="visibleFromTagList" @click.left.stop="removeTag")
        img.icon(src="@/assets/remove.svg")
        span Remove Tag

  //- loading without cached cards
  section(v-if="!state.cards.length && state.loading")
    Loader(:visible="state.loading")

  //- cards found, or loading with cached cards
  section.results-section(v-if="state.cards.length" ref="resultsElement" :style="{'max-height': state.resultsSectionHeight + 'px'}")
    ResultsFilter(:hideFilter="shouldHideResultsFilter" :items="state.cards" @updateFilter="updateFilter" @updateFilteredItems="updateFilteredCards")
    SpaceCardList(:groupedItems="groupedItems" :isLoading="state.loading" @selectSpace="changeSpace" @selectCard="focusOnCard" :currentCard="currentCard")
</template>

<style lang="stylus">
.tag-details
  cursor auto
  transform-origin top left
  section.edit-card
    background-color var(--secondary-background)
  button.select-all
    width initial
    .current-color
      display inline-block
      vertical-align -2px
      margin-right 4px
  .results-section
    border-top 1px solid var(--primary-border)
    padding-top 3px
  .loader
    margin-left 6px
    img
      display inline
      max-height 30px
      border-radius var(--small-entity-radius)
      margin-right 5px
      vertical-align middle
  .space-badge
    background-color var(--secondary-background)
  .tag-title-row
    justify-content space-between
    align-items center
    .tag-name
      margin-left 6px
    > .row
      margin 0
  .toggle-filter
    min-width 49px
  .is-dark
    .tag-name,
    .no-cards
      filter invert(1)
</style>
