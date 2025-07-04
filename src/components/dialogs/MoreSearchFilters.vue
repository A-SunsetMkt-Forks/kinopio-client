<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useCardStore } from '@/stores/useCardStore'
import { useConnectionStore } from '@/stores/useConnectionStore'
import { useBoxStore } from '@/stores/useBoxStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'

import ResultsFilter from '@/components/ResultsFilter.vue'
import frames from '@/data/frames.js'
import utils from '@/utils.js'
import FrameBadge from '@/components/FrameBadge.vue'

import uniq from 'lodash-es/uniq'

const globalStore = useGlobalStore()
const cardStore = useCardStore()
const connectionStore = useConnectionStore()
const boxStore = useBoxStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()

const dialogElement = ref(null)
const resultsElement = ref(null)

onMounted(() => {
  window.addEventListener('resize', updateDialogHeight)
})

const emit = defineEmits(['updateCount'])

const props = defineProps({
  visible: Boolean
})
const state = reactive({
  dialogHeight: null,
  filter: '',
  filteredItems: [],
  resultsSectionHeight: null
})

watch(() => props.visible, (value, prevValue) => {
  if (value) {
    updateDialogHeight()
    updateResultsSectionHeight()
  }
})

const updateDialogHeight = async () => {
  if (!props.visible) { return }
  await nextTick()
  const element = dialogElement.value
  state.dialogHeight = utils.elementHeight(element)
}
const updateHeights = () => {
  updateDialogHeight()
  updateResultsSectionHeight()
}
const updateResultsSectionHeight = async () => {
  if (!props.visible) { return }
  await nextTick()
  const element = resultsElement.value
  state.resultsSectionHeight = utils.elementHeight(element, true)
}

// items

const totalFiltersActive = computed(() => userStore.getUserTotalFiltersActive())
const connectionTypes = computed(() => connectionStore.getAllConnectionTypes)
const spaceFrames = computed(() => {
  const cards = cardStore.getAllCards
  let framesInUse = cards.map(card => card.frameId)
  framesInUse = uniq(framesInUse.filter(frame => frame))
  return framesInUse.map(frame => frames[frame])
})
const tags = computed(() => spaceStore.getSpaceTags)
const boxes = computed(() => boxStore.getAllBoxes)

// all items

const allItems = computed(() => {
  // tags
  const tagsItems = tags.value.map(tag => {
    tag.isTag = true
    return tag
  })
  // connection types
  const connectionTypesItems = connectionTypes.value.map(type => {
    type.isConnectionType = true
    return type
  })
  // frames
  const framesItems = spaceFrames.value.map(frame => {
    frame.isFrame = true
    return frame
  })
  // boxes
  const boxesItems = boxes.value.map(box => {
    box.isBox = true
    return box
  })
  return tagsItems.concat(connectionTypesItems, framesItems, boxesItems)
})
const items = computed(() => {
  if (state.filter) {
    const items = {
      boxes: [],
      tags: [],
      connectionTypes: [],
      frames: []
    }
    state.filteredItems.forEach(item => {
      if (item.isTag) {
        items.tags.push(item)
      } else if (item.isConnectionType) {
        items.connectionTypes.push(item)
      } else if (item.isFrame) {
        items.frames.push(item)
      } else if (item.isBox) {
        items.boxes.push(item)
      }
    })
    return items
  } else {
    return {
      boxes: boxes.value,
      tags: tags.value,
      connectionTypes: connectionTypes.value,
      frames: spaceFrames.value
    }
  }
})
const currentFilteredItemsIds = computed(() => {
  return globalStore.filteredConnectionTypeIds.concat(globalStore.filteredFrameIds, globalStore.filteredTagNames, globalStore.filteredBoxIds)
})
const boxBadgeStyles = (box) => {
  return {
    border: `1px solid ${box.color}`,
    borderTop: `8px solid ${box.color}`
  }
}

// update filter

const updateFilteredItems = (items) => {
  state.filteredItems = items
}
const updateFilter = (filter) => {
  state.filter = filter
}
const clearResultsFilter = () => {
  state.filter = ''
  state.filteredItems = []
  const searchElement = document.querySelector('dialog.filters .search-wrap input')
  if (searchElement) {
    searchElement.value = ''
  }
}
const clearAllFilters = () => {
  globalStore.clearAllFilters()
  clearResultsFilter()
}

// Toggle filters

const toggleFilteredBox = (box) => {
  const filtered = globalStore.filteredBoxIds
  if (filtered.includes(box.id)) {
    globalStore.removeFromFilteredBoxId(box.id)
  } else {
    globalStore.addToFilteredBoxId(box.id)
  }
}
const toggleFilteredTag = (tag) => {
  const tags = globalStore.filteredTagNames
  if (tags.includes(tag.name)) {
    globalStore.removeFromFilteredTagNames(tag.name)
  } else {
    globalStore.addToFilteredTagNames(tag.name)
  }
}
const toggleFilteredConnectionType = (type) => {
  const filtered = globalStore.filteredConnectionTypeIds
  if (filtered.includes(type.id)) {
    globalStore.removeFromFilteredConnectionTypeId(type.id)
  } else {
    globalStore.addToFilteredConnectionTypeId(type.id)
  }
}
const toggleFilteredCardFrame = (frame) => {
  const filtered = globalStore.filteredFrameIds
  if (filtered.includes(frame.id)) {
    globalStore.removeFromFilteredFrameIds(frame.id)
  } else {
    globalStore.addToFilteredFrameIds(frame.id)
  }
}

// Item state

const isSelected = (item) => {
  return currentFilteredItemsIds.value.includes(item.id)
}
const boxIsActive = (box) => {
  const boxes = globalStore.filteredBoxIds
  return boxes.includes(box.id)
}
const tagIsActive = (tag) => {
  const tags = globalStore.filteredTagNames
  return tags.includes(tag.name)
}
const connectionTypeIsActive = (type) => {
  const types = globalStore.filteredConnectionTypeIds
  return types.includes(type.id)
}
const frameIsActive = (frame) => {
  const frames = globalStore.filteredFrameIds
  return frames.includes(frame.id)
}
</script>

<template lang="pug">
dialog.more-filters.narrow(v-if="props.visible" :open="props.visible" ref="dialogElement" :style="{'max-height': state.dialogHeight + 'px'}" @click.stop)
  section
    //- Clear
    button(@click.left="clearAllFilters")
      img.icon.cancel(src="@/assets/add.svg")
      span Clear All
      span.badge.info.total-filters-active(v-if="totalFiltersActive") {{totalFiltersActive}}

  section.results-section.connection-types(ref="resultsElement" :style="{'max-height': state.resultsSectionHeight + 'px'}")
    ResultsFilter(:items="allItems" @updateFilter="updateFilter" @updateFilteredItems="updateFilteredItems")
    ul.results-list
      //- Boxes
      template(v-for="box in items.boxes" :key="box.id")
        li(:class="{ active: boxIsActive(box) }" @click.left="toggleFilteredBox(box)" tabindex="0" v-on:keyup.enter="toggleFilteredBox(box)")
          input(type="checkbox" :checked="isSelected(box)")
          .box-badge.badge(:style="boxBadgeStyles(box)")
            .box-info(:style="{backgroundColor: box.color}")
            .box-fill(:style="{backgroundColor: box.color}")
          .name {{box.name}}
      //- Tags
      template(v-for="tag in items.tags" :key="tag.id")
        li(:class="{ active: tagIsActive(tag) }" @click.left="toggleFilteredTag(tag)" tabindex="0" v-on:keyup.enter="toggleFilteredTag(tag)")
          input(type="checkbox" :checked="isSelected(tag)")
          .badge(:style="{backgroundColor: tag.color}") {{tag.name}}
      //- Connection Types
      template(v-for="type in items.connectionTypes" :key="type.id")
        li(:class="{ active: connectionTypeIsActive(type) }" @click.left="toggleFilteredConnectionType(type)" tabindex="0" v-on:keyup.enter="toggleFilteredConnectionType(type)")
          input(type="checkbox" :checked="isSelected(type)")
          .badge(:style="{backgroundColor: type.color}")
          .name {{type.name}}
      //- Frames
      template(v-for="(frame in items.frames" :key="frame.id")
        li.frames-list(:class="{active: frameIsActive(frame)}" @click.left="toggleFilteredCardFrame(frame)" tabindex="0" v-on:keyup.enter="toggleFilteredCardFrame(frame)")
          input(type="checkbox" :checked="isSelected(frame)")
          .badge
            FrameBadge(:frame="frame")
          .name {{frame.name}}
</template>

<style lang="stylus">
dialog.more-filters
  @media(max-width 630px)
    left -100px
  @media(max-width 510px)
    left -150px
  .badge
    display inline-block
    vertical-align middle
  .name
    display inline-block
  .frames-list
    .badge
      width 17px
      height 19px
      padding 0
      display inline-block
      img
        width 100%
  .connection-types
    padding-bottom 0
  .results-section
    overflow scroll
  input[type="checkbox"]
    margin-top 1px
  .total-filters-active
    margin 0
    margin-left 5px
    margin-top -8px
    transform translateY(2px)
  .box-badge
    padding 1px 4px
    overflow hidden
    .box-fill
      top 0
      left 0
      width 100%
      height 100%
      position absolute
      opacity 0.5
</style>
