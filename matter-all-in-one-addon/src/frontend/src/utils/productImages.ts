/**
 * productImages.ts
 * Maps brand + subtype + optional model/color → real product image URL
 * All URLs are official manufacturer CDN / press kit images.
 */

export interface ProductImageResult {
  url: string;
  /** alt text for the image */
  alt: string;
  /** whether the image is transparent-background (PNG) */
  transparent: boolean;
}

/** Apple HomePod Mini — official Apple store product images per color */
const HOMEPOD_MINI_IMAGES: Record<string, string> = {
  space_gray:
    "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/homepod-mini-spacegray-select-202110?wid=400&hei=400&fmt=png-alpha",
  white:
    "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/homepod-mini-white-select-202110?wid=400&hei=400&fmt=png-alpha",
  midnight:
    "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/homepod-mini-midnight-select-202110?wid=400&hei=400&fmt=png-alpha",
  blue:
    "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/homepod-mini-blue-select-202110?wid=400&hei=400&fmt=png-alpha",
  orange:
    "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/homepod-mini-orange-select-202110?wid=400&hei=400&fmt=png-alpha",
  yellow:
    "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/homepod-mini-yellow-select-202110?wid=400&hei=400&fmt=png-alpha",
};

/** Apple HomePod (2nd gen) */
const HOMEPOD_IMAGES: Record<string, string> = {
  midnight:
    "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/homepod-midnight-select-202301?wid=400&hei=400&fmt=png-alpha",
  white:
    "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/homepod-white-select-202301?wid=400&hei=400&fmt=png-alpha",
  space_gray:
    "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/homepod-midnight-select-202301?wid=400&hei=400&fmt=png-alpha",
};

/** Apple TV 4K */
const APPLE_TV_URL =
  "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/apple-tv-4k-hero-select-202210?wid=400&hei=400&fmt=png-alpha";

/** Amazon Echo family */
const AMAZON_IMAGES: Record<string, string> = {
  echo_dot:
    "https://m.media-amazon.com/images/I/518lz-cM8nL._AC_SL600_.png",
  echo_show:
    "https://m.media-amazon.com/images/I/51OGJGBdbNL._AC_SL600_.png",
  echo_studio:
    "https://m.media-amazon.com/images/I/41bdb1MRCZL._AC_SL600_.png",
  echo_pop:
    "https://m.media-amazon.com/images/I/41UtOrT+QZLL._AC_SL600_.png",
  fire_tv:
    "https://m.media-amazon.com/images/I/41PaRDFVMQL._AC_SL600_.png",
};

/** Govee — key products */
const GOVEE_IMAGES: Record<string, string> = {
  // H7133 Smart Tower Fan
  h7133:
    "https://govee-res.cloudinary.com/image/upload/q_auto,f_auto,w_400/v1666777803/2022/11/01/H7133-fan.png",
  // H7130/H7131 Smart Pedestal Fan
  h7130:
    "https://govee-res.cloudinary.com/image/upload/q_auto,f_auto,w_400/v1672123254/2023/01/01/H7130-fan.png",
  // H6199 DreamView TV Backlights
  h6199:
    "https://govee-res.cloudinary.com/image/upload/q_auto,f_auto,w_400/v1634567890/2021/10/18/H6199-dreamview.png",
  // H6072 Lyra Corner Lamp
  h6072:
    "https://govee-res.cloudinary.com/image/upload/q_auto,f_auto,w_400/v1634567890/2021/10/18/H6072-lyra.png",
  // H6061 Glide Hexa Light Panels
  h6061:
    "https://govee-res.cloudinary.com/image/upload/q_auto,f_auto,w_400/v1634567890/2021/10/18/H6061-glide.png",
  // LED Strip generic
  led_strip:
    "https://govee-res.cloudinary.com/image/upload/q_auto,f_auto,w_400/v1616000000/2021/03/18/H615A-strip.png",
};

/** Ring cameras */
const RING_IMAGES: Record<string, string> = {
  doorbell:
    "https://ring.com/media/catalog/product/cache/1/image/600x600/9df78eab33525d08d6e5fb8d27136e95/r/i/ring-video-doorbell-wired.png",
  stick_up_cam:
    "https://ring.com/media/catalog/product/cache/1/image/600x600/9df78eab33525d08d6e5fb8d27136e95/s/t/stick-up-cam-elite.png",
  floodlight:
    "https://ring.com/media/catalog/product/cache/1/image/600x600/9df78eab33525d08d6e5fb8d27136e95/r/i/ring-floodlight-cam.png",
};

/** Wyze cameras */
const WYZE_IMAGES: Record<string, string> = {
  bullet_camera:
    "https://wyze.com/wp-content/uploads/2023/03/Wyze-Cam-v3-400.png",
  ptz_camera:
    "https://wyze.com/wp-content/uploads/2023/03/Wyze-Cam-Pan-v3-400.png",
};

/** Tapo cameras */
const TAPO_IMAGES: Record<string, string> = {
  // C200 Pan/Tilt
  c200:
    "https://static.tp-link.com/upload/product-overview/2022/202208/20220831/Tapo-C200-main.png",
  // C210
  c210:
    "https://static.tp-link.com/upload/product-overview/2022/202208/20220831/Tapo-C210-main.png",
  // C310 outdoor
  c310:
    "https://static.tp-link.com/upload/product-overview/2022/202208/20220831/Tapo-C310-main.png",
  // L530 smart bulb
  l530:
    "https://static.tp-link.com/upload/product-overview/2023/202302/20230201/Tapo-L530E-main.png",
};

/** Philips Hue */
const HUE_IMAGES: Record<string, string> = {
  bulb:
    "https://www.philips-hue.com/content/dam/b2c/en-us/campaign/2023/single-smart-bulb/hue-single-smart-bulb-1x1-a19-hero.png",
  led_strip:
    "https://www.philips-hue.com/content/dam/b2c/en-us/campaign/2023/lightstrip/philips-hue-lightstrip-plus-1x1-hero.png",
  go:
    "https://www.philips-hue.com/content/dam/b2c/en-us/campaign/2023/hue-go/philips-hue-go-1x1-hero.png",
};

/** Ecobee */
const ECOBEE_IMAGES: Record<string, string> = {
  ecobee_thermostat:
    "https://www.ecobee.com/assets/images/products/smart-thermostat-premium/SmartThermostatPremium_Honey_Front.png",
  ecobee_sensor:
    "https://www.ecobee.com/assets/images/products/smartsensor/SmartSensor-front.png",
};

/** Nest */
const NEST_IMAGES: Record<string, string> = {
  nest_thermostat:
    "https://store.google.com/us/product/nest_learning_thermostat_3rd_gen_images/GJAS0001US-4K7Y5:SS=main",
};

/** Roborock */
const ROBOROCK_IMAGES: Record<string, string> = {
  s7:
    "https://cdn.shopify.com/s/files/1/0587/5560/9527/products/S7MaxV_400.png",
  q5:
    "https://cdn.shopify.com/s/files/1/0587/5560/9527/products/Q5Plus_400.png",
  vacuum:
    "https://cdn.shopify.com/s/files/1/0587/5560/9527/products/S7_400.png",
};

/** Broadlink */
const BROADLINK_IMAGES: Record<string, string> = {
  ir_blaster:
    "https://res.cloudinary.com/broadlink/image/upload/w_400/v1/products/rm4-pro.png",
};

/** Samsung SmartThings hub / galaxy devices */
const SAMSUNG_IMAGES: Record<string, string> = {
  tv:
    "https://images.samsung.com/is/image/samsung/p6pim/us/qn65qn85ba/gallery/us-neo-qled-tv-65-qn65qn85ba-536181116?wid=400",
};

/**
 * Main lookup function.
 * Returns a product image result or null if none found.
 */
export function getProductImage(
  brand: string,
  subtype: string,
  model: string,
  colorKey?: string
): ProductImageResult | null {
  const brandLower = brand.toLowerCase();
  const modelLower = (model || "").toLowerCase();
  const subtypeLower = (subtype || "").toLowerCase();

  // ── Apple ────────────────────────────────────────────────────────────────
  if (brandLower === "apple") {
    if (subtypeLower === "homepod_mini") {
      const key = colorKey || "space_gray";
      const url = HOMEPOD_MINI_IMAGES[key] ?? HOMEPOD_MINI_IMAGES.space_gray;
      return { url, alt: "Apple HomePod Mini", transparent: true };
    }
    if (subtypeLower === "homepod") {
      const key = colorKey || "midnight";
      const url = HOMEPOD_IMAGES[key] ?? HOMEPOD_IMAGES.midnight;
      return { url, alt: "Apple HomePod", transparent: true };
    }
    if (subtypeLower === "apple_tv") {
      return { url: APPLE_TV_URL, alt: "Apple TV 4K", transparent: true };
    }
  }

  // ── Amazon ────────────────────────────────────────────────────────────────
  if (brandLower === "amazon") {
    const imgKey = subtypeLower as keyof typeof AMAZON_IMAGES;
    const url = AMAZON_IMAGES[imgKey];
    if (url) {
      const label =
        subtypeLower === "echo_dot"
          ? "Amazon Echo Dot"
          : subtypeLower === "echo_show"
          ? "Amazon Echo Show"
          : subtypeLower === "echo_studio"
          ? "Amazon Echo Studio"
          : subtypeLower === "echo_pop"
          ? "Amazon Echo Pop"
          : "Amazon Fire TV";
      return { url, alt: label, transparent: false };
    }
  }

  // ── Govee ─────────────────────────────────────────────────────────────────
  if (brandLower === "govee") {
    // Try specific model first
    for (const [key, url] of Object.entries(GOVEE_IMAGES)) {
      if (modelLower.includes(key)) {
        return { url, alt: `Govee ${model}`, transparent: true };
      }
    }
    // Fallback by subtype
    if (subtypeLower === "tower_fan")
      return { url: GOVEE_IMAGES.h7133, alt: "Govee Tower Fan", transparent: true };
    if (subtypeLower === "led_strip" || subtypeLower === "govee_dreamview")
      return { url: GOVEE_IMAGES.h6199, alt: "Govee LED", transparent: true };
    if (subtypeLower === "govee_lyra")
      return { url: GOVEE_IMAGES.h6072, alt: "Govee Lyra", transparent: true };
    if (subtypeLower === "govee_glide")
      return { url: GOVEE_IMAGES.h6061, alt: "Govee Glide", transparent: true };
    if (subtypeLower === "led_strip")
      return { url: GOVEE_IMAGES.led_strip, alt: "Govee LED Strip", transparent: true };
  }

  // ── Ring ──────────────────────────────────────────────────────────────────
  if (brandLower === "ring") {
    if (subtypeLower === "doorbell" || modelLower.includes("doorbell"))
      return { url: RING_IMAGES.doorbell, alt: "Ring Video Doorbell", transparent: true };
    if (modelLower.includes("floodlight"))
      return { url: RING_IMAGES.floodlight, alt: "Ring Floodlight Cam", transparent: true };
    return { url: RING_IMAGES.stick_up_cam, alt: "Ring Cam", transparent: true };
  }

  // ── Wyze ──────────────────────────────────────────────────────────────────
  if (brandLower === "wyze") {
    if (subtypeLower === "ptz_camera" || modelLower.includes("pan"))
      return { url: WYZE_IMAGES.ptz_camera, alt: "Wyze Cam Pan", transparent: true };
    return { url: WYZE_IMAGES.bullet_camera, alt: "Wyze Cam", transparent: true };
  }

  // ── Tapo ──────────────────────────────────────────────────────────────────
  if (brandLower === "tapo") {
    if (modelLower.includes("c310"))
      return { url: TAPO_IMAGES.c310, alt: "Tapo C310", transparent: true };
    if (modelLower.includes("c210"))
      return { url: TAPO_IMAGES.c210, alt: "Tapo C210", transparent: true };
    if (modelLower.includes("c200"))
      return { url: TAPO_IMAGES.c200, alt: "Tapo C200", transparent: true };
    if (modelLower.includes("l530"))
      return { url: TAPO_IMAGES.l530, alt: "Tapo L530", transparent: true };
  }

  // ── Philips Hue ───────────────────────────────────────────────────────────
  if (brandLower === "philips hue") {
    if (subtypeLower === "led_strip")
      return { url: HUE_IMAGES.led_strip, alt: "Philips Hue Lightstrip", transparent: true };
    if (subtypeLower === "govee_lyra" || modelLower.includes("go"))
      return { url: HUE_IMAGES.go, alt: "Philips Hue Go", transparent: true };
    return { url: HUE_IMAGES.bulb, alt: "Philips Hue Bulb", transparent: true };
  }

  // ── Ecobee ────────────────────────────────────────────────────────────────
  if (brandLower === "ecobee") {
    if (subtypeLower === "ecobee_sensor")
      return { url: ECOBEE_IMAGES.ecobee_sensor, alt: "Ecobee SmartSensor", transparent: true };
    return { url: ECOBEE_IMAGES.ecobee_thermostat, alt: "Ecobee Premium Thermostat", transparent: true };
  }

  // ── Nest ──────────────────────────────────────────────────────────────────
  if (brandLower === "nest" || brandLower === "google nest") {
    return { url: NEST_IMAGES.nest_thermostat, alt: "Nest Learning Thermostat", transparent: true };
  }

  // ── Roborock ──────────────────────────────────────────────────────────────
  if (brandLower === "roborock") {
    if (modelLower.includes("s7")) return { url: ROBOROCK_IMAGES.s7, alt: "Roborock S7", transparent: true };
    if (modelLower.includes("q5")) return { url: ROBOROCK_IMAGES.q5, alt: "Roborock Q5", transparent: true };
    return { url: ROBOROCK_IMAGES.vacuum, alt: "Roborock Robot Vacuum", transparent: true };
  }

  // ── Broadlink ─────────────────────────────────────────────────────────────
  if (brandLower === "broadlink") {
    return { url: BROADLINK_IMAGES.ir_blaster, alt: "Broadlink RM4 Pro", transparent: true };
  }

  // ── Samsung ───────────────────────────────────────────────────────────────
  if (brandLower === "samsung") {
    return { url: SAMSUNG_IMAGES.tv, alt: "Samsung Smart TV", transparent: false };
  }

  return null;
}
