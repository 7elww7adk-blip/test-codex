# متجر تشطيبات (نسخة واجهة)

نسخة Front-end عربية شبيهة بتصميم موقع توريدات، وتم تجهيزها بحيث تكون سهلة الربط لاحقًا مع Google Sheets + Apps Script.

## التشغيل

```bash
python3 -m http.server 4173
```

ثم افتح: `http://localhost:4173`

## التعديل السهل

- عدّل الأقسام من المصفوفة `categories` داخل `app.js`.
- عدّل الأسعار والصور والمنتجات من المصفوفة `products` داخل `app.js`.
- عدّل الماركات من المصفوفة `brands` داخل `app.js`.

> الخطوة التالية: استبدال المصفوفات الثابتة بطلبات API من Google Apps Script.


## بنرات الصفحة الرئيسية

- البنرات حالياً مربوطة بمصفوفة `heroBanners` داخل `app.js` بنفس شكل البيانات الحالي.
- روابط البنرات المستخدمة: 
  - `https://i.postimg.cc/85RrXLmS/Banner_Webcopy51489383142.webp`
  - `https://i.postimg.cc/d12TNGjc/Banner_AR1038069354.webp`
  - `https://i.postimg.cc/0QYJX70R/regrand_web_banner_ar1385672365.webp`
