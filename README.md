# متجر تشطيبات (نسخة واجهة)

 codex/understand-arabic-language-6mavtx
نسخة Front-end عربية شبيهة بتصميم موقع توريدات، وتم تجهيزها للربط مع **Google Sheets + Apps Script** مع وجود Fallback محلي إذا الرابط غير مضاف.
=======
main

## التشغيل

```bash
python3 -m http.server 4173
```

ثم افتح: `http://localhost:4173`

 codex/understand-arabic-language-6mavtx
=======
 codex/understand-arabic-language-okhsdu
 main
## ربط Google Sheets + Apps Script

### 1) جهّز الشيتات داخل Google Sheet
لازم تنشئ 4 Sheets بالأسماء بالضبط:

- `categories` بالأعمدة:
  - `name`, `image`
- `heroBanners` بالأعمدة:
  - `image`
- `products` بالأعمدة:
  - `name`, `price`, `old`, `brand`, `code`, `image`
- `brands` بالأعمدة:
  - `name`, `logo`

### 2) جهّز Apps Script
- افتح Google Sheet → Extensions → Apps Script
- انسخ محتوى الملف `apps-script/Code.gs`
- Deploy → New deployment → Web app
- Execute as: `Me`
- Who has access: `Anyone`
- خذ رابط الـ Web app النهائي

### 3) اربط الرابط في الواجهة
داخل `app.js` عدّل المتغير:

```js
const APPS_SCRIPT_URL = "";
```

وحط مكانه رابط الـ Web app.

## ملاحظات

- لو `APPS_SCRIPT_URL` فاضي أو فيه خطأ، الموقع هيشتغل تلقائيًا على البيانات المحلية (Fallback).
- تقدر تتابع حالة مصدر البيانات من الرسالة أعلى الصفحة:
  - `Google Sheets`
  - أو `Fallback`

## البنرات الحالية

- `https://i.postimg.cc/85RrXLmS/Banner_Webcopy51489383142.webp`
- `https://i.postimg.cc/d12TNGjc/Banner_AR1038069354.webp`
- `https://i.postimg.cc/0QYJX70R/regrand_web_banner_ar1385672365.webp`
 codex/understand-arabic-language-6mavtx
=======
=======
## التعديل السهل

- عدّل الأقسام من المصفوفة `categories` داخل `app.js`.
- عدّل الأسعار والصور والمنتجات من المصفوفة `products` داخل `app.js`
- عدّل الماركات من المصفوفة `brands` داخل `app.js`.

> الخطوة التالية: استبدال المصفوفات الثابتة بطلبات API من Google Apps Script.


## بنرات الصفحة الرئيسية

- البنرات حالياً مربوطة بمصفوفة `heroBanners` داخل `app.js` بنفس شكل البيانات الحالي.
- روابط البنرات المستخدمة: 
  - `https://i.postimg.cc/85RrXLmS/Banner_Webcopy51489383142.webp`
  - `https://i.postimg.cc/d12TNGjc/Banner_AR1038069354.webp`
  - `https://i.postimg.cc/0QYJX70R/regrand_web_banner_ar1385672365.webp`
 main
 main
