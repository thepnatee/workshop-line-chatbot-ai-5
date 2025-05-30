<template>
    <div class="container mt-5">
        <h2>แบบสอบถาม DISC Model</h2>
        <div v-if="loading" class="loading-spinner">
            <!-- You can use a spinner component or a simple message -->
            <div class="spinner-border" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>
        <form v-else @submit.prevent="handleSubmit">
            <div v-for="(question, index) in questions" :key="index" class="mb-3">
                <label :for="'question-' + index" class="form-label">{{ question.text }}</label>
                <div v-for="(option, idx) in question.options" :key="idx" class="form-check">
                    <input :id="'question-' + index + '-option-' + idx" type="radio" v-model="responses[index]"
                        :value="option" class="form-check-input">
                    <label :for="'question-' + index + '-option-' + idx" class="form-check-label">{{ option }}</label>
                </div>
            </div>
            <button type="submit" class="btn btn-primary">Submit</button>
        </form>
    </div>
</template>
<script>
import axios from 'axios';
import liff from "@line/liff";
import.meta.env;

export default {
    data() {
        return {
            loading: true,
            idToken: null,
            profile: null,
            questions: [
                {
                    text: "1. เมื่อทำงานในกลุ่ม คุณมักจะ...",
                    options: [
                        "A. เป็นผู้นำและกำหนดทิศทาง",
                        "B. สร้างบรรยากาศให้ทีมรู้สึกดี",
                        "C. ทำงานร่วมกับคนอื่นอย่างราบรื่น",
                        "D. ตรวจสอบรายละเอียดและความถูกต้อง"
                    ]
                },
                {
                    text: "2. เมื่อเจอสถานการณ์ใหม่ที่ไม่เคยเจอมาก่อน คุณจะ...",
                    options: [
                        "A. ลุยทันทีไม่รอใคร",
                        "B. อยากรู้จักคนอื่นและพูดคุย",
                        "C. ขอคำแนะนำจากคนรอบตัวก่อน",
                        "D. หาข้อมูล วิเคราะห์ ก่อนตัดสินใจ"
                    ]
                },
                {
                    text: "3. คุณรู้สึกภูมิใจที่สุดเมื่อ...",
                    options: [
                        "A. บรรลุเป้าหมายหรือความสำเร็จ",
                        "B. ทุกคนในทีมรู้สึกสนุกและพอใจ",
                        "C. งานราบรื่นโดยไม่มีปัญหา",
                        "D. งานมีความถูกต้องและมีคุณภาพสูง"
                    ]
                },
                {
                    text: "4. เมื่อต้องทำงานภายใต้แรงกดดัน คุณมักจะ...",
                    options: [
                        "A. เร่งผลักดันทีมให้เดินหน้า",
                        "B. ใช้พลังบวกปลุกใจทีม",
                        "C. ค่อยๆ ประสานงานและแก้ไขปัญหา",
                        "D. วางแผนอย่างรอบคอบและทำตามลำดับขั้น"
                    ]
                },
                {
                    text: "5. ถ้าให้เลือกสิ่งที่คุณให้ความสำคัญที่สุดในการทำงาน...",
                    options: [
                        "A. ประสิทธิภาพและความสำเร็จ",
                        "B. ความสัมพันธ์กับเพื่อนร่วมงาน",
                        "C. ความมั่นคงและความสม่ำเสมอ",
                        "D. ความถูกต้องและความเป็นระบบ"
                    ]
                }
            ],
            responses: [
                "B. สร้างบรรยากาศให้ทีมรู้สึกดี",
                "B. อยากรู้จักคนอื่นและพูดคุย",
                "B. ทุกคนในทีมรู้สึกสนุกและพอใจ",
                "B. ใช้พลังบวกปลุกใจทีม",
                "B. ความสัมพันธ์กับเพื่อนร่วมงาน",
            ]
        };
    },

    beforeCreate() {
        console.log("LIFF ID:", import.meta.env.VITE_LIFF_ID);
        liff.init({ liffId: import.meta.env.VITE_LIFF_ID }, (data) => {
            console.log("LIFF initialized");
        });
    },

    async mounted() {
        try {
            await this.checkLiffLogin();
        } catch (error) {
            console.error("Error during LIFF login check:", error);
            alert("เกิดข้อผิดพลาดในการตรวจสอบการเข้าสู่ระบบ");
            this.loading = false;
        }
    },

    methods: {
        async checkLiffLogin() {
            try {
                await liff.ready;
                if (!liff.isLoggedIn()) {
                    liff.login({ redirectUri: window.location.href });
                } else {
                    this.idToken = await liff.getIDToken();
                    this.loading = false;
                }
            } catch (error) {
                console.error("checkLiffLogin error:", error);
                throw new Error("Failed to check LIFF login");
            }
        },

        async handleSubmit() {
            if (this.hasUnansweredQuestions()) {
                alert("กรุณาตอบคำถามให้ครบทุกข้อ");
                return;
            }

            this.loading = true;
            const answerData = { answers: [...this.responses] };

            try {
                const response = await axios.post(
                    import.meta.env.VITE_ENDPOINT_DISC_API,
                    answerData,
                    {
                        headers: { Authorization: `${this.idToken}` },
                    }
                );

                if (liff.isInClient()) {
                    await liff.sendMessages([
                        { type: "text", text: "ฉันได้ประเมินเรียบร้อยแล้ว" },
                    ]);
                    liff.closeWindow();
                } else {
                    alert(`ผลที่ได้คือคุณเป็นกลุ่ม: ${response.data.model}`);
                }
            } catch (error) {
                console.error("handleSubmit error:", error);
                alert("เกิดข้อผิดพลาดในการส่งคำตอบ กรุณาลองใหม่อีกครั้ง");
            } finally {
                this.loading = false;
            }
        },

        hasUnansweredQuestions() {
            return this.responses.length !== this.questions.length || this.responses.some(response => response === undefined);
        }
    },
};
</script>

<style>
.error {
    color: red;
}
</style>