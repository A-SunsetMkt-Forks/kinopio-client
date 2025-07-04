<script setup>
import { reactive, computed, onMounted, watch, ref, nextTick } from 'vue'

import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'
import { useApiStore } from '@/stores/useApiStore'

import User from '@/components/User.vue'
import Loader from '@/components/Loader.vue'
import utils from '@/utils.js'

const userStore = useUserStore()
const spaceStore = useSpaceStore()
const apiStore = useApiStore()

const props = defineProps({
  visible: Boolean,
  price: Object // { amount, period, stripePriceId }
})

const state = reactive({
  loading: {
    subscribe: false
  },
  error: {
    unknownServerError: false
  }
})

const currentUser = computed(() => userStore.getUserAllState)

const clearState = () => {
  state.loading.subscribe = false
  state.error.unknownServerError = false
}
const isLifetimePlan = computed(() => props.price.period === 'life')

// subscribe

const subscribeUrl = async () => {
  const result = await apiStore.subscriptionUrl({
    priceId: props.price.stripePriceId,
    userId: userStore.id,
    period: props.price.period
  })
  return result
}

const checkoutUrl = async () => {
  const result = await apiStore.checkoutUrl({
    priceId: props.price.stripePriceId,
    userId: userStore.id,
    period: props.price.period
  })
  return result
}

const subscribe = async () => {
  if (state.loading.subscribe) { return }
  try {
    let result
    clearState()
    state.loading.subscribe = true
    if (isLifetimePlan.value) {
      result = await checkoutUrl()
    } else {
      result = await subscribeUrl()
    }
    window.location = result.url
  } catch (error) {
    console.error('🚒 subscribe', error)
    clearState()
    state.error.unknownServerError = true
  }
}

</script>

<template lang="pug">
.upgrade-user-stripe(v-if="visible")
  p Tax included.
    span {{' '}}
    template(v-if="isLifetimePlan")
      span This is a one-time perpetual license purchase.
    template(v-else)
      span You can cancel anytime.

  //- button
  .row
    button(@click.left="subscribe" :class="{active : state.loading.subscribe}")
      User(:user="currentUser" :isClickable="false" :hideYouLabel="true" :key="currentUser.id" :isSmall="true")
      span Upgrade for ${{price.amount}}/{{price.period}}
      Loader(:visible="state.loading.subscribe")
  .badge.danger(v-if="state.error.unknownServerError")
    span (シ_ _)シ Something went wrong, Please try again or contact support. Your transaction was not processed.

</template>

<style lang="stylus">
</style>
