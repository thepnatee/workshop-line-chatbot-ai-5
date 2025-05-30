<template>
  <div class="checkin-board">
    <div class="date-count">
      <span class="date">{{ date }}</span>
      <span class="count">👥 {{ count }} คน</span>
      <button class="reset-btn" @click="resetCheckins">รีเซ็ต</button>
    </div>
    <div class="bubble-area">
      <transition-group name="bubble-fade" tag="div">
        <div
          v-for="(c, i) in checkins"
          :key="c.userId"
          class="bubble-card"
          :style="bubbleStyle(i)"
        >
          <img :src="c.pictureUrl" class="bubble-avatar" />
          <div class="bubble-name">{{ c.displayName }}</div>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, watch } from 'vue';

interface Checkin {
  userId: string;
  displayName: string;
  pictureUrl: string;
  timestamp: number;
}

const bubbleColors = [
  '#e0f7fa', '#ffe0b2', '#f8bbd0', '#dcedc8', '#fff9c4', '#d1c4e9', '#b2dfdb', '#ffecb3', '#c8e6c9', '#f0f4c3'
];

export default defineComponent({
  name: 'CheckinBoard',
  setup() {
    const date = ref('');
    const count = ref(0);
    const checkins = ref<Checkin[]>([]);
    const positions = ref<{ top: number; left: number }[]>([]);
    const areaPadding = 30;
    const minSize = 60; // เพิ่มขนาดขั้นต่ำ
    const maxSize = 180; // เพิ่มขนาดสูงสุด
    const animationDuration = 700;

    // คำนวณขนาด bubble ตามจำนวนคน
    function getBubbleSize(n: number) {
      if (n <= 10) return maxSize;
      if (n >= 60) return minSize;
      return Math.round(maxSize - ((maxSize - minSize) * (n - 10)) / 50);
    }

    // สุ่มตำแหน่งแบบไม่ทับกัน (พยายาม)
    function generatePositions(n: number, size: number, areaW: number, areaH: number) {
      const tries = 1000;
      const pos: { top: number; left: number }[] = [];
      for (let i = 0; i < n; i++) {
        let t = 0;
        let found = false;
        while (t < tries && !found) {
          const top = Math.random() * (areaH - size - areaPadding * 2) + areaPadding;
          const left = Math.random() * (areaW - size - areaPadding * 2) + areaPadding;
          // check overlap
          if (
            pos.every(
              (p) =>
                Math.hypot(p.left - left, p.top - top) > size * 0.95 // allow a little overlap
            )
          ) {
            pos.push({ top, left });
            found = true;
          }
          t++;
        }
        if (!found) pos.push({ top: areaPadding, left: areaPadding });
      }
      return pos;
    }

    // สร้าง style สำหรับแต่ละ bubble
    function bubbleStyle(i: number): Record<string, string> {
      const n = checkins.value.length;
      const areaW = window.innerWidth;
      const areaH = window.innerHeight - 80;
      const size = getBubbleSize(n);
      const bg = bubbleColors[i % bubbleColors.length];
      const pos = positions.value[i] || { top: areaPadding, left: areaPadding };
      return {
        position: 'absolute',
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        background: bg,
        width: `${size}px`,
        height: `${size}px`,
        transition: `all ${animationDuration}ms cubic-bezier(.4,2,.6,1)`
      };
    }

    // อัปเดตตำแหน่งทุกครั้งที่จำนวน checkins เปลี่ยน
    function updatePositions() {
      const n = checkins.value.length;
      const areaW = window.innerWidth;
      const areaH = window.innerHeight - 80;
      const size = getBubbleSize(n);
      positions.value = generatePositions(n, size, areaW, areaH);
    }

    onMounted(() => {
      const ws = new WebSocket('ws://e72f1489b9df.ngrok.app');
      ws.onmessage = (event) => {
        console.log('WS message:', event.data); // เพิ่มบรรทัดนี้
        const data = JSON.parse(event.data);
        date.value = data.date;
        count.value = data.count;
        if (data.checkins.length === 0) {
          checkins.value = Array.from({ length: 50 }).map((_, i) => ({
            userId: `mock-${i}`,
            displayName: `Mock ${i + 1}`,
            pictureUrl: 'https://cdn-icons-png.flaticon.com/512/149/149071.png',
            timestamp: Date.now(),
          }));
        } else {
          checkins.value = data.checkins;
        }
      };
      updatePositions();
      window.addEventListener('resize', updatePositions);
    });

    watch(checkins, updatePositions);

    function resetCheckins() {
      fetch('http://localhost:4000/reset', { method: 'POST' })
        .then(() => {
          // หลัง reset แล้วจะมีการ broadcast ข้อมูลใหม่ผ่าน websocket
        });
    }

    return { date, count, checkins, bubbleStyle, resetCheckins };
  },
});
</script>

<style scoped>
.checkin-board {
  width: 100vw;
  min-height: 100vh;
  background: #fff;
  border-radius: 0;
  box-shadow: none;
  padding: 24px 0 0 0;
  margin: 0;
  position: relative;
}
.date-count {
  display: flex;
  justify-content: space-between;
  font-size: 1.2em;
  margin: 0 40px 16px 40px;
}
.reset-btn {
  background: #ff5252;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 4px 16px;
  font-size: 1em;
  margin-left: 16px;
  cursor: pointer;
  transition: background 0.2s;
}
.reset-btn:hover {
  background: #d32f2f;
}
.bubble-area {
  position: relative;
  width: 100vw;
  height: calc(100vh - 80px);
  background: #f5f5f5;
  border-radius: 0;
  overflow: auto;
  margin: 0 auto;
}
.bubble-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0,0,0,0.10);
  z-index: 2;
  position: absolute;
  /* transition ถูกกำหนดใน style inline */
}
.bubble-avatar {
  width: 70%;
  height: 70%;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #00c300;
  margin-bottom: 4px;
}
.bubble-name {
  font-size: 0.9em;
  text-align: center;
  word-break: break-all;
  color: #333;
  font-weight: bold;
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bubble-fade-enter-active, .bubble-fade-leave-active {
  transition: opacity 0.5s;
}
.bubble-fade-enter-from, .bubble-fade-leave-to {
  opacity: 0;
}
</style>
