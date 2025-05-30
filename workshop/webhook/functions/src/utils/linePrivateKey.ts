export const lineOauthPrivate = {
    privateKey: {
      alg: "",        // (optional) อัลกอริธึม เช่น "RS256"
      d: "",          // ส่วนของ private exponent
      dp: "",         // CRT exponent 1
      dq: "",         // CRT exponent 2
      e: "",          // public exponent
      ext: true,      // extension ใช้ตามมาตรฐาน WebCrypto
      key_ops:[""],  // เช่น ["sign"]
      kty: "RSA",     // ประเภท key
      n: "",          // modulus
      p: "",          // prime1
      q: "",          // prime2
      qi: ""          // CRT coefficient
    }
  };
  