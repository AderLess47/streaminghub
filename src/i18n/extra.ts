import type { Locale } from "./config";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/**
 * Additional locale packs. These are intentionally partial: every shipped
 * string falls back to the checked English dictionary until a human
 * translation is reviewed. German and English are complete.
 */
export const extraLocales: Partial<Record<Locale, DeepPartial<unknown>>> = {
  tr: {
    nav: {
      home: "Ana sayfa",
      premium: "Premium",
      download: "İndir",
      help: "Yardım merkezi",
      faq: "SSS",
      contact: "İletişim",
      status: "Sistem durumu",
      activate: "Cihazı etkinleştir",
      login: "Giriş yap",
      register: "Hesap oluştur",
      dashboard: "Panel",
      logout: "Çıkış yap",
      language: "Dil",
    },
    home: {
      hero: {
        eyebrow: "Fire TV ve Android için IPTV oynatıcı",
        title: "Senin içeriklerin. Senin deneyimin. StreamingHub.",
        subtitle:
          "Kendi oynatma listelerini modern, hızlı ve düzenli bir uygulamada deneyimle. Televizyonun ve mobil cihazların için optimize edildi.",
        ctaPrimary: "StreamingHub'ı keşfet",
        ctaSecondary: "Uygulamayı indir",
      },
    },
    footer: { product: "Ürün", support: "Yardım ve destek", legal: "Yasal", account: "Hesap" },
  },
  ar: {
    nav: {
      home: "الرئيسية",
      premium: "بريميوم",
      download: "تنزيل",
      help: "مركز المساعدة",
      faq: "الأسئلة الشائعة",
      contact: "اتصل بنا",
      status: "حالة النظام",
      activate: "تفعيل الجهاز",
      login: "تسجيل الدخول",
      register: "إنشاء حساب",
      dashboard: "لوحة التحكم",
      logout: "تسجيل الخروج",
      language: "اللغة",
    },
    home: {
      hero: {
        eyebrow: "مشغل IPTV لأجهزة Fire TV و Android",
        title: "محتواك. تجربتك. StreamingHub.",
        subtitle:
          "استمتع بقوائم التشغيل الخاصة بك في تطبيق حديث وسريع ومنظم. مُحسَّن لتلفازك وأجهزتك المحمولة.",
        ctaPrimary: "اكتشف StreamingHub",
        ctaSecondary: "تنزيل التطبيق",
      },
    },
    footer: { product: "المنتج", support: "المساعدة والدعم", legal: "قانوني", account: "الحساب" },
  },
  fr: {
    nav: {
      home: "Accueil",
      premium: "Premium",
      download: "Téléchargement",
      help: "Centre d'aide",
      faq: "FAQ",
      contact: "Contact",
      status: "État du système",
      activate: "Activer un appareil",
      login: "Se connecter",
      register: "Créer un compte",
      dashboard: "Tableau de bord",
      logout: "Se déconnecter",
      language: "Langue",
    },
    home: {
      hero: {
        eyebrow: "Lecteur IPTV pour Fire TV et Android",
        title: "Vos contenus. Votre expérience. StreamingHub.",
        subtitle:
          "Profitez de vos propres playlists dans une application moderne, rapide et claire. Optimisée pour votre téléviseur et vos appareils mobiles.",
        ctaPrimary: "Découvrir StreamingHub",
        ctaSecondary: "Télécharger l'application",
      },
    },
    footer: { product: "Produit", support: "Aide et support", legal: "Mentions légales", account: "Compte" },
  },
  es: {
    nav: {
      home: "Inicio",
      premium: "Premium",
      download: "Descargar",
      help: "Centro de ayuda",
      faq: "Preguntas frecuentes",
      contact: "Contacto",
      status: "Estado del sistema",
      activate: "Activar dispositivo",
      login: "Iniciar sesión",
      register: "Crear cuenta",
      dashboard: "Panel",
      logout: "Cerrar sesión",
      language: "Idioma",
    },
    home: {
      hero: {
        eyebrow: "Reproductor IPTV para Fire TV y Android",
        title: "Tu contenido. Tu experiencia. StreamingHub.",
        subtitle:
          "Disfruta de tus propias listas de reproducción en una aplicación moderna, rápida y clara. Optimizada para tu televisor y tus dispositivos móviles.",
        ctaPrimary: "Descubrir StreamingHub",
        ctaSecondary: "Descargar la app",
      },
    },
    footer: { product: "Producto", support: "Ayuda y soporte", legal: "Legal", account: "Cuenta" },
  },
  it: {
    nav: {
      home: "Home",
      premium: "Premium",
      download: "Download",
      help: "Centro assistenza",
      faq: "FAQ",
      contact: "Contatti",
      status: "Stato del sistema",
      activate: "Attiva dispositivo",
      login: "Accedi",
      register: "Crea account",
      dashboard: "Dashboard",
      logout: "Esci",
      language: "Lingua",
    },
    home: {
      hero: {
        eyebrow: "Lettore IPTV per Fire TV e Android",
        title: "I tuoi contenuti. La tua esperienza. StreamingHub.",
        subtitle:
          "Usa le tue playlist in un'app moderna, veloce e ordinata. Ottimizzata per la TV e i dispositivi mobili.",
        ctaPrimary: "Scopri StreamingHub",
        ctaSecondary: "Scarica l'app",
      },
    },
    footer: { product: "Prodotto", support: "Aiuto e supporto", legal: "Note legali", account: "Account" },
  },
  el: {
    nav: {
      home: "Αρχική",
      premium: "Premium",
      download: "Λήψη",
      help: "Κέντρο βοήθειας",
      faq: "Συχνές ερωτήσεις",
      contact: "Επικοινωνία",
      status: "Κατάσταση συστήματος",
      activate: "Ενεργοποίηση συσκευής",
      login: "Σύνδεση",
      register: "Δημιουργία λογαριασμού",
      dashboard: "Πίνακας",
      logout: "Αποσύνδεση",
      language: "Γλώσσα",
    },
    home: {
      hero: {
        eyebrow: "Αναπαραγωγέας IPTV για Fire TV και Android",
        title: "Το περιεχόμενό σου. Η εμπειρία σου. StreamingHub.",
        subtitle:
          "Απόλαυσε τις δικές σου λίστες αναπαραγωγής σε μια σύγχρονη, γρήγορη και καθαρή εφαρμογή. Βελτιστοποιημένη για την τηλεόραση και τις φορητές συσκευές σου.",
        ctaPrimary: "Ανακάλυψε το StreamingHub",
        ctaSecondary: "Λήψη εφαρμογής",
      },
    },
    footer: { product: "Προϊόν", support: "Βοήθεια & υποστήριξη", legal: "Νομικά", account: "Λογαριασμός" },
  },
};
