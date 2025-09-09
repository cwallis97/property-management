/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        "gradient-x": "gradient-x 8s ease infinite",
        "gradient-y": "gradient-y 8s ease infinite",
        "gradient-xy": "gradient-xy 15s ease infinite",
      },
      keyframes: {
        "gradient-x": {
          "0%, 100%": { "background-size": "200% 200%", "background-position": "left center" },
          "50%": { "background-size": "200% 200%", "background-position": "right center" },
        },
        "gradient-y": {
          "0%, 100%": { "background-size": "200% 200%", "background-position": "center top" },
          "50%": { "background-size": "200% 200%", "background-position": "center bottom" },
        },
        "gradient-xy": {
          "0%, 100%": { "background-size": "200% 200%", "background-position": "left top" },
          "50%": { "background-size": "200% 200%", "background-position": "right bottom" },
        },
      },
    },
  },
  plugins: [],
}
