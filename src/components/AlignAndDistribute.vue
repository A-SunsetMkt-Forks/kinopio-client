<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useCardStore } from '@/stores/useCardStore'
import { useConnectionStore } from '@/stores/useConnectionStore'
import { useBoxStore } from '@/stores/useBoxStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'

import utils from '@/utils.js'
import consts from '@/consts.js'

import uniqBy from 'lodash-es/uniqBy'

const globalStore = useGlobalStore()
const cardStore = useCardStore()
const connectionStore = useConnectionStore()
const boxStore = useBoxStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()

let unsubscribes

onMounted(() => {
  const globalActionUnsubscribe = globalStore.$onAction(
    ({ name, args }) => {
      if (name === 'triggerSelectedItemsAlignLeft') {
        alignLeft()
      }
    }
  )
  unsubscribes = () => {
    globalActionUnsubscribe()
  }
})
onMounted(() => {
  unsubscribes()
})

const props = defineProps({
  visible: Boolean,
  numberOfSelectedItemsCreatedByCurrentUser: Object,
  shouldHideMoreOptions: Boolean,
  shouldDistributeWithAlign: Boolean,
  canEditAll: Object,
  cards: Object,
  editableCards: Object,
  connections: Object,
  boxes: Object,
  editableBoxes: Object
})

const spaceCounterZoomDecimal = computed(() => globalStore.getSpaceCounterZoomDecimal)
const moreOptionsIsVisible = computed(() => userStore.shouldShowMoreAlignOptions)
const multipleCardsSelectedIds = computed(() => globalStore.multipleCardsSelectedIds)
const multipleConnectionsSelectedIds = computed(() => globalStore.multipleConnectionsSelectedIds)
const multipleBoxesSelectedIds = computed(() => globalStore.multipleBoxesSelectedIds)
const isSpaceMember = computed(() => userStore.getUserIsSpaceMember)
const spaceBetween = computed(() => consts.spaceBetweenCards * spaceCounterZoomDecimal.value)
const canDistribute = computed(() => {
  const minimumRequiredToDistribute = 3
  let cards, boxes
  if (isSpaceMember.value) {
    cards = multipleCardsSelectedIds.value.length >= minimumRequiredToDistribute
    boxes = multipleBoxesSelectedIds.value.length >= minimumRequiredToDistribute
  } else {
    cards = props.numberOfSelectedItemsCreatedByCurrentUser.cards >= minimumRequiredToDistribute
    boxes = props.numberOfSelectedItemsCreatedByCurrentUser.boxes >= minimumRequiredToDistribute
  }
  return Boolean(cards) || Boolean(boxes)
})
const items = computed(() => {
  const boxes = normalizeBoxes(props.boxes)
  return props.cards.concat(boxes)
})
const toggleMoreOptionsIsVisible = () => {
  const value = !moreOptionsIsVisible.value
  userStore.updateUser({ shouldShowMoreAlignOptions: value })
}
const ySpaceBetweenCards = (card) => {
  let value = consts.spaceBetweenCards
  if (card?.counterIsVisible) {
    value += 10
  }
  return value
}

// verify positioning

const yIsDistributed = computed(() => {
  const cards = sortedByY.value.cards
  const zoom = spaceCounterZoomDecimal.value
  let isDistributed = true
  if (props.shouldDistributeWithAlign) {
    cards.forEach((card, index) => {
      if (index > 0) {
        const previousItem = cards[index - 1]
        const rect = utils.cardElementDimensions({ id: previousItem.id }) || utils.boxElementDimensions({ id: previousItem.id }) || previousItem
        const previousItemHeight = rect.height
        const previousBottomSide = previousItem.y + previousItemHeight
        const yDelta = card.y - previousBottomSide
        const isNotEquallyDistributed = !utils.isBetween({
          value: Math.abs(yDelta),
          min: consts.spaceBetweenCards - 1,
          max: consts.spaceBetweenCards + 1
        })
        if (isNotEquallyDistributed) {
          isDistributed = false
        }
      }
    })
  }
  return isDistributed
})
const xIsDistributed = computed(() => {
  const cards = sortedByX.value.cards
  const zoom = spaceCounterZoomDecimal.value
  let xIsDistributed = true
  if (props.shouldDistributeWithAlign) {
    cards.forEach((card, index) => {
      if (index > 0) {
        const previousItem = cards[index - 1]
        const rect = utils.cardElementDimensions({ id: previousItem.id }) || utils.boxElementDimensions({ id: previousItem.id }) || previousItem
        const previousItemWidth = rect.width
        const previousRightSide = previousItem.x + previousItemWidth
        const xDelta = card.x - previousRightSide
        const isNotEquallyDistributed = !utils.isBetween({
          value: Math.abs(xDelta),
          min: consts.spaceBetweenCards - 1,
          max: consts.spaceBetweenCards + 1
        })
        if (isNotEquallyDistributed) {
          xIsDistributed = false
        }
      }
    })
  }
  return xIsDistributed
})
const isLeftAligned = computed(() => {
  const xValues = items.value.map(item => item.x)
  const xIsAligned = xValues.every(x => x === xValues[0])
  return xIsAligned && yIsDistributed.value
})
const isCenteredHorizontally = computed(() => {
  const cards = sortedByX.value.cards
  if (!cards.length) { return }
  const origin = cards[0]
  const cardsCenterX = origin.x + (origin.width / 2)
  let centerIsEqual = true
  cards.forEach(card => {
    const roundedCenterIsEqual = utils.isBetween({
      value: card.x + (card.width / 2),
      min: cardsCenterX - 1,
      max: cardsCenterX + 1
    })
    if (!roundedCenterIsEqual) {
      centerIsEqual = false
    }
  })
  return centerIsEqual
})
const isRightAligned = computed(() => {
  const zoom = spaceCounterZoomDecimal.value
  const origin = items.value[0]
  const xRight = origin.x + origin.width
  const xIsAligned = items.value.every(item => {
    return utils.isBetween({
      value: item.x + item.width,
      min: xRight - 1,
      max: xRight + 1
    })
  })
  return xIsAligned
})
const isDistributedHorizontally = computed(() => {
  if (items.value.length < 3) { return }
  const sortedItems = sortedByX.value.all
  const distances = xDistancesBetween(sortedItems)
  const distanceBetweenCards = Math.abs(distances[0])
  let distanceIsEqual = true
  distances.forEach((distance, index) => {
    distance = Math.abs(distance)
    const roundedDistanceIsEqual = utils.isBetween({
      value: distance,
      min: distanceBetweenCards - 1,
      max: distanceBetweenCards + 1
    })
    if (!roundedDistanceIsEqual) {
      distanceIsEqual = false
    }
  })
  return distanceIsEqual
})
const isTopAligned = computed(() => {
  const yValues = items.value.map(item => item.y)
  const yIsAligned = yValues.every(y => y === yValues[0])
  return yIsAligned && xIsDistributed.value
})
const isCenteredVertically = computed(() => {
  const cards = sortedByY.value.cards
  if (!cards.length) { return }
  const origin = cards[0]
  const cardsCenterY = origin.y + (origin.height / 2)
  let centerIsEqual = true
  cards.forEach(card => {
    const roundedCenterIsEqual = utils.isBetween({
      value: card.y + (card.height / 2),
      min: cardsCenterY - 1,
      max: cardsCenterY + 1
    })
    if (!roundedCenterIsEqual) {
      centerIsEqual = false
    }
  })
  return centerIsEqual
})
const isBottomAligned = computed(() => {
  const origin = items.value[0]
  const yBottom = origin.y + origin.height
  const yIsAligned = items.value.every(item => {
    const bottomIsEqual = utils.isBetween({
      value: item.y + item.height,
      min: yBottom - 1,
      max: yBottom + 1
    })
    return bottomIsEqual
  })
  return yIsAligned
})
const isDistributedVertically = computed(() => {
  if (props.cards.length < 3) { return }
  const cards = sortedByY.value.cards
  const distancesBetween = yDistancesBetween(cards)
  const distanceBetweenCards = distancesBetween[0]
  let distanceIsEqual = true
  distancesBetween.forEach((distance, index) => {
    distance = Math.abs(distance)
    const roundedDistanceIsEqual = utils.isBetween({
      value: distance,
      min: distanceBetweenCards - 1,
      max: distanceBetweenCards + 1
    })
    if (!roundedDistanceIsEqual) {
      distanceIsEqual = false
    }
  })
  return distanceIsEqual
})

// sort items

const sortedByX = computed(() => {
  // cards
  const editableCards = utils.clone(props.editableCards)
  const cards = utils.sortByX(editableCards)
  // boxes
  const editableBoxes = utils.clone(props.editableBoxes)
  let boxes = normalizeBoxes(editableBoxes)
  boxes = utils.sortByX(boxes)
  // all
  const all = cards.concat(boxes)
  return { cards, boxes, all }
})
const sortedByY = computed(() => {
  // cards
  const editableCards = utils.clone(props.editableCards)
  const cards = utils.sortByY(editableCards)
  // boxes
  const editableBoxes = utils.clone(props.editableBoxes)
  let boxes = normalizeBoxes(editableBoxes)
  boxes = utils.sortByY(boxes)
  // all
  const all = cards.concat(boxes)
  return { cards, boxes, all }
})
const sortedByXWidth = computed(() => {
  const editableCards = utils.clone(props.editableCards)
  const cards = editableCards.sort((a, b) => {
    return (b.x + b.width) - (a.x + a.width)
  })
  const editableBoxes = utils.clone(props.editableBoxes)
  let boxes = normalizeBoxes(editableBoxes)
  boxes = boxes.sort((a, b) => {
    return (b.x + b.width) - (a.x + a.width)
  })
  const all = cards.concat(boxes)
  return { cards, boxes, all }
})
const sortedByYHeight = computed(() => {
  const editableCards = utils.clone(props.editableCards)
  const cards = editableCards.sort((a, b) => {
    return (b.y + b.height) - (a.y + a.height)
  })
  const editableBoxes = utils.clone(props.editableBoxes)
  let boxes = normalizeBoxes(editableBoxes)
  boxes = boxes.sort((a, b) => {
    return (b.y + b.height) - (a.y + a.height)
  })
  const all = cards.concat(boxes)
  return { cards, boxes, all }
})
const normalizeBoxes = (boxes) => {
  boxes = utils.clone(boxes)
  boxes = boxes.map(box => {
    box.width = box.resizeWidth
    box.height = box.resizeHeight
    return box
  })
  return boxes
}

// update items

const updateItem = (item, type) => {
  if (type === 'cards') {
    cardStore.updateCard(item)
  }
  if (type === 'boxes') {
    boxStore.updateBox(item)
  }
}
const updateCardDimensions = async () => {
  await nextTick()
  cardStore.updateCardsDimensions(props.cards)
  await nextTick()
  await nextTick()
}
const updateConnectionPaths = async () => {
  await updateCardDimensions()
  const itemIds = globalStore.getMultipleItemsSelected
  connectionStore.updateConnectionPathsByItemIds(itemIds)
}

// update positions

// ⎺o
const alignTop = () => {
  const cards = sortedByX.value.cards
  const boxes = sortedByX.value.boxes
  alignTopItems(cards, 'cards')
  alignTopItems(boxes, 'boxes')
}
const alignTopItems = (items, type) => {
  const zoom = spaceCounterZoomDecimal.value
  const newItems = []
  const origin = items[0]
  items.forEach((item, index) => {
    if (index > 0) {
      item = utils.clone(item)
      item.y = origin.y
      if (props.shouldDistributeWithAlign) {
        const previousItem = newItems[index - 1]
        const rect = utils.cardElementDimensions({ id: previousItem.id }) || utils.boxElementDimensions({ id: previousItem.id }) || previousItem
        const previousRightSide = previousItem.x + rect.width
        item.x = previousRightSide + consts.spaceBetweenCards
      }
      updateItem(item, type)
    }
    newItems.push(item)
  })
  if (type === 'cards') { updateConnectionPaths() }
}
// o|o
const centerHorizontally = () => {
  const cards = sortedByX.value.cards
  const boxes = sortedByX.value.boxes
  centerHorizontallyItems(cards, 'cards')
  centerHorizontallyItems(boxes, 'boxes')
}
const centerHorizontallyItems = (items, type) => {
  const origin = items[0]
  items.forEach((item, index) => {
    if (index > 0) {
      const previousItem = items[index - 1]
      const previousBottomSide = previousItem.y + previousItem.height
      item = utils.clone(item)
      item.x = origin.x + (origin.width / 2) - (item.width / 2)
      if (props.shouldDistributeWithAlign) {
        item.y = previousBottomSide + spaceBetween.value
      }
      updateItem(item, type)
    }
  })
  if (type === 'cards') { updateConnectionPaths() }
}
// o|
const alignRight = () => {
  const cards = sortedByXWidth.value.cards
  const boxes = sortedByXWidth.value.boxes
  alignRightItems(cards, 'cards')
  alignRightItems(boxes, 'boxes')
}
const alignRightItems = (items, type) => {
  const zoom = spaceCounterZoomDecimal.value
  const origin = items[0]
  if (!origin) { return }
  let rect = utils.cardElementDimensions({ id: origin.id }) || utils.boxElementDimensions({ id: origin.id }) || origin
  const originWidth = rect.width
  items.forEach((item, index) => {
    if (index > 0) {
      item = utils.clone(item)
      rect = utils.cardElementDimensions({ id: item.id }) || utils.boxElementDimensions({ id: item.id }) || item
      const itemWidth = rect.width
      item.x = origin.x + originWidth - itemWidth
      updateItem(item, type)
    }
  })
  if (type === 'cards') { updateConnectionPaths() }
}
// | o |
const distributeHorizontally = () => {
  const cards = sortedByX.value.cards
  const boxes = sortedByX.value.boxes
  distributeHorizontallyItems(cards, 'cards')
  distributeHorizontallyItems(boxes, 'boxes')
}
const distributeHorizontallyItems = (items, type) => {
  if (!items.length) { return }
  const distances = xDistancesBetween(items)
  const distance = utils.averageOfNumbers(distances)
  let previousItem = items[0]
  items.forEach((item, index) => {
    if (index > 0) {
      item = utils.clone(item)
      item.x = previousItem.x + previousItem.width + distance
      previousItem = item
      updateItem(item, type)
    }
  })
  if (type === 'cards') { updateConnectionPaths() }
}
// |o
const alignLeft = () => {
  const cards = sortedByY.value.cards
  const boxes = sortedByY.value.boxes
  alignLeftItems(cards, 'cards')
  alignLeftItems(boxes, 'boxes')
}
const alignLeftItems = (items, type) => {
  const zoom = spaceCounterZoomDecimal.value
  const newItems = []
  const origin = items[0]
  items.forEach((item, index) => {
    if (index > 0) {
      item = utils.clone(item)
      item.x = origin.x
      if (props.shouldDistributeWithAlign) {
        const previousItem = newItems[index - 1]
        const rect = utils.cardElementDimensions({ id: previousItem.id }) || utils.boxElementDimensions({ id: previousItem.id }) || previousItem
        const previousItemHeight = rect.height
        const previousBottomSide = previousItem.y + previousItemHeight
        item.y = previousBottomSide + ySpaceBetweenCards(previousItem)
      }
      updateItem(item, type)
    }
    newItems.push(item)
  })
  if (type === 'cards') { updateConnectionPaths() }
}
// o-o
const centerVertically = () => {
  const cards = sortedByX.value.cards
  const boxes = sortedByX.value.boxes
  centerVerticallyItems(cards, 'cards')
  centerVerticallyItems(boxes, 'boxes')
}
const centerVerticallyItems = (items, type) => {
  const origin = items[0]
  items.forEach((item, index) => {
    if (index > 0) {
      item = utils.clone(item)
      if (props.shouldDistributeWithAlign) {
        const previousItem = items[index - 1]
        const previousRightSide = previousItem.x + previousItem.width
        item.x = previousRightSide + spaceBetween.value
      }
      item.y = origin.y + (origin.height / 2) - (item.height / 2)
      updateItem(item, type)
    }
  })
  if (type === 'cards') { updateConnectionPaths() }
}
// _o
const alignBottom = () => {
  const cards = sortedByYHeight.value.cards
  const boxes = sortedByYHeight.value.boxes
  alignBottomItems(cards, 'cards')
  alignBottomItems(boxes, 'boxes')
}
const alignBottomItems = (items, type) => {
  const origin = items[0]
  items.forEach((item, index) => {
    if (index > 0) {
      item = utils.clone(item)
      item.y = origin.y + origin.height - item.height
      if (props.shouldDistributeWithAlign) {
        const previousItem = items[index - 1]
        const previousRightSide = previousItem.x + previousItem.width
        item.x = previousRightSide + spaceBetween.value
      }
      updateItem(item, type)
    }
  })
  if (type === 'cards') { updateConnectionPaths() }
}
// ⎺ o _
const distributeVertically = () => {
  const cards = sortedByY.value.cards
  const boxes = sortedByY.value.boxes
  distributeVerticallyItems(cards, 'cards')
  distributeVerticallyItems(boxes, 'boxes')
}
const distributeVerticallyItems = (items, type) => {
  if (!items.length) { return }
  const distances = yDistancesBetween(items)
  const distance = Math.round(utils.averageOfNumbers(distances))
  let previousItem = items[0]
  items.forEach((item, index) => {
    if (index > 0) {
      item = utils.clone(item)
      item.y = previousItem.y + previousItem.height + distance
      previousItem = item
      updateItem(item, type)
    }
  })
  if (type === 'cards') { updateConnectionPaths() }
}

// distances between

const xDistancesBetween = (items) => {
  const xDistances = []
  items.forEach((item, index) => {
    if (index > 0) {
      const previousItem = items[index - 1]
      const previousRightSide = previousItem.x + previousItem.width
      const leftSide = item.x
      xDistances.push(leftSide - previousRightSide)
    }
  })
  return xDistances
}
const yDistancesBetween = (items) => {
  const yDistances = []
  items.forEach((item, index) => {
    if (index > 0) {
      const previousItem = items[index - 1]
      const previousBottomSide = previousItem.y + previousItem.height
      const topSide = item.y
      yDistances.push(topSide - previousBottomSide)
    }
  })
  return yDistances
}
</script>

<template lang="pug">
.align-and-distribute(v-if="visible")
  .segmented-buttons(v-if="shouldHideMoreOptions")
    //- |o
    button(title="Align Left and Distribute" :disabled="!canEditAll.cards" @click.left="alignLeft" :class="{active: isLeftAligned}")
      img.icon(src="@/assets/align-left-distributed.svg")
    //- ⎺o
    button(title="Align Top and Distribute" :disabled="!canEditAll.cards" @click.left="alignTop" :class="{active: isTopAligned}")
      img.icon.align-top(src="@/assets/align-left-distributed.svg")
    button(title="More Options" :disabled="!canEditAll.cards" @click.left="toggleMoreOptionsIsVisible" :class="{active: moreOptionsIsVisible}")
      img.icon.down-arrow(src="@/assets/down-arrow.svg")

  //- More Options
  .more-options(v-if="visible && !shouldHideMoreOptions")
    .segmented-buttons.first-row
      //- |o
      button(title="Align Left" :disabled="!canEditAll.cards" @click.left="alignLeft" :class="{active: isLeftAligned}")
        img.icon(src="@/assets/align-left.svg")
      //- o|o
      button(title="Center Horizontally" :disabled="!canEditAll.cards" @click.left="centerHorizontally" :class="{active: isCenteredHorizontally}")
        img.icon(src="@/assets/center-horizontally.svg")
      //- o|
      button(title="Align Right" :disabled="!canEditAll.cards" @click.left="alignRight" :class="{active: isRightAligned}")
        img.icon.align-right(src="@/assets/align-left.svg")
      //- | o |
      button(title="Distribute Horizontally" :disabled="!canDistribute" @click.left="distributeHorizontally" :class="{active: isDistributedHorizontally}")
        img.icon(src="@/assets/distribute-horizontally.svg")
    .segmented-buttons.last-row
      //- ⎺o
      button(title="Align Top" :disabled="!canEditAll.cards" @click.left="alignTop" :class="{active: isTopAligned}")
        img.icon.align-top(src="@/assets/align-left.svg")
      //- o-o
      button(title="Center Verticaly" :disabled="!canEditAll.cards" @click.left="centerVertically" :class="{active: isCenteredVertically}")
        img.icon.center-vertically(src="@/assets/center-horizontally.svg")
      //- _o
      button(title="Align Bottom" :disabled="!canEditAll.cards" @click.left="alignBottom" :class="{active: isBottomAligned}")
        img.icon.align-bottom(src="@/assets/align-left.svg")
      //- ⎺ o _
      button(title="Distribute Vertically" :disabled="!canDistribute" @click.left="distributeVertically" :class="{active: isDistributedVertically}")
        img.icon.distribute-vertically(src="@/assets/distribute-horizontally.svg")
</template>

<style lang="stylus">
.align-and-distribute
  .down-arrow
    padding 0
    vertical-align 2px
  .up-arrow
    transform rotate(180deg)

  .align-top
    transform rotate(90deg)
  .align-bottom
    transform rotate(-90deg)
  .align-right
    transform rotate(180deg)
  .center-vertically
    transform rotate(-90deg)
  .distribute-vertically
    transform rotate(90deg)
  .more-options
    margin 0
    margin-top 10px
</style>
