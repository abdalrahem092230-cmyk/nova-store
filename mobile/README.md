# Nova Store Mobile

تطبيق Expo/React Native مرتبط مباشرة بنفس backend وقاعدة بيانات موقع NOVA STORE.

## النسخة الأولى
- منتجات وأقسام وبحث
- تفاصيل المنتج والمفضلة والسلة المحفوظة
- طلب كضيف أو بحساب العميل
- تسجيل/دخول
- سجل الطلبات
- تتبع الطلب
- نفس الأسعار والمخزون والطلبات الموجودة في الموقع

## التشغيل
```bash
cd mobile
npm install
npx expo-doctor
npx expo start
```

## APK
بعد تسجيل الدخول في Expo:
```bash
npx eas-cli build --platform android --profile preview
```

الـ API الافتراضي: https://nova-store-icxo.onrender.com
ويمكن تغييره عبر EXPO_PUBLIC_API_URL.
