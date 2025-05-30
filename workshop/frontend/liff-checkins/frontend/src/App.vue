<template>
  <div>
    <CheckinBoard />
  </div>
</template>

<script lang="ts">
import CheckinBoard from "./components/CheckinBoard.vue";

export default {
  components: { CheckinBoard },
};
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
