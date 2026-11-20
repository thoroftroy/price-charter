/* Demo price dataset. Prices in USD. Edit freely.
   For production, replace with fetch() to your backend / scraper. */
const STORES = [
  { id: "smiths", name: "Smith's", color: "#0b5ed7" },
  { id: "walmart", name: "Walmart", color: "#0071ce" },
  { id: "costco", name: "Costco", color: "#d50032" },
  { id: "target", name: "Target", color: "#cc0000" },
  { id: "aldi", name: "Aldi", color: "#f59e0b" },
  { id: "traderjoes", name: "Trader Joe's", color: "#15803d" },
  { id: "wholefoods", name: "Whole Foods", color: "#166534" },
  { id: "kroger", name: "Kroger", color: "#1d4ed8" },
];

const CATEGORIES = ["Produce","Dairy & Eggs","Bakery","Meat & Seafood","Pantry","Frozen","Snacks","Beverages","Household"];

const PRODUCTS = [
  { id:"milk-1gal", name:"Whole Milk", brand:"Store brand", size:"1 gal", unitQty:128, unitName:"fl oz", category:"Dairy & Eggs", emoji:"🥛", prices:{ smiths:3.99, walmart:3.68, costco:3.49, target:3.89, aldi:3.29, kroger:3.99, traderjoes:3.79 } },
  { id:"eggs-12", name:"Large Eggs", brand:"Grade A", size:"12 ct", unitQty:12, unitName:"egg", category:"Dairy & Eggs", emoji:"🥚", prices:{ smiths:4.29, walmart:3.97, costco:3.20, target:4.19, aldi:2.99, kroger:4.29, traderjoes:3.99, wholefoods:5.49 } },
  { id:"bread-white", name:"White Sandwich Bread", brand:"Wonder / Store", size:"20 oz loaf", unitQty:20, unitName:"oz", category:"Bakery", emoji:"🍞", prices:{ smiths:2.79, walmart:2.48, costco:2.99, target:2.79, aldi:1.89, kroger:2.79 } },
  { id:"butter-1lb", name:"Salted Butter", brand:"Land O'Lakes", size:"1 lb (4 sticks)", unitQty:16, unitName:"oz", category:"Dairy & Eggs", emoji:"🧈", prices:{ smiths:4.99, walmart:4.48, costco:3.75, target:4.99, aldi:3.89, traderjoes:4.29, wholefoods:5.99 } },
  { id:"cheddar-16oz", name:"Sharp Cheddar Block", brand:"Tillamook", size:"16 oz", unitQty:16, unitName:"oz", category:"Dairy & Eggs", emoji:"🧀", prices:{ smiths:5.49, walmart:4.97, costco:4.20, target:5.29, kroger:5.49, wholefoods:6.99 } },
  { id:"chicken-breast", name:"Chicken Breast", brand:"Boneless skinless", size:"per lb", unitQty:1, unitName:"lb", category:"Meat & Seafood", emoji:"🍗", prices:{ smiths:3.49, walmart:2.98, costco:2.49, target:3.79, aldi:2.79, wholefoods:4.99, traderjoes:3.99 } },
  { id:"ground-beef", name:"Ground Beef 80/20", brand:"per lb", size:"per lb", unitQty:1, unitName:"lb", category:"Meat & Seafood", emoji:"🥩", prices:{ smiths:5.49, walmart:4.97, costco:3.99, target:5.49, aldi:4.49, kroger:5.49 } },
  { id:"salmon", name:"Atlantic Salmon Fillet", brand:"Fresh", size:"per lb", unitQty:1, unitName:"lb", category:"Meat & Seafood", emoji:"🐟", prices:{ smiths:9.99, walmart:8.97, costco:7.99, target:10.99, wholefoods:12.99, traderjoes:9.99 } },
  { id:"bananas", name:"Bananas", brand:"Fresh", size:"per lb", unitQty:1, unitName:"lb", category:"Produce", emoji:"🍌", prices:{ smiths:0.69, walmart:0.62, costco:0.55, target:0.69, aldi:0.54, traderjoes:0.69, wholefoods:0.79 } },
  { id:"avocado", name:"Hass Avocado", brand:"Each", size:"each", unitQty:1, unitName:"ea", category:"Produce", emoji:"🥑", prices:{ smiths:1.50, walmart:1.28, costco:1.00, target:1.50, aldi:1.09, traderjoes:1.29, wholefoods:1.99 } },
  { id:"tomatoes", name:"Roma Tomatoes", brand:"Fresh", size:"per lb", unitQty:1, unitName:"lb", category:"Produce", emoji:"🍅", prices:{ smiths:1.99, walmart:1.68, costco:1.49, target:1.99, aldi:1.49 } },
  { id:"spinach", name:"Baby Spinach", brand:"Organic", size:"5 oz box", unitQty:5, unitName:"oz", category:"Produce", emoji:"🥬", prices:{ smiths:3.99, walmart:3.48, costco:2.80, target:3.79, traderjoes:2.99, wholefoods:4.99, aldi:2.89 } },
  { id:"rice-white", name:"Long Grain White Rice", brand:"Mahatma", size:"5 lb bag", unitQty:80, unitName:"oz", category:"Pantry", emoji:"🍚", prices:{ smiths:5.49, walmart:4.72, costco:3.99, target:5.29, aldi:4.29 } },
  { id:"pasta", name:"Spaghetti", brand:"Barilla", size:"16 oz box", unitQty:16, unitName:"oz", category:"Pantry", emoji:"🍝", prices:{ smiths:1.99, walmart:1.48, costco:1.10, target:1.79, aldi:1.09, kroger:1.99, traderjoes:1.29 } },
  { id:"olive-oil", name:"Extra Virgin Olive Oil", brand:"Bertolli", size:"16.9 fl oz", unitQty:16.9, unitName:"fl oz", category:"Pantry", emoji:"🫒", prices:{ smiths:9.99, walmart:8.48, costco:6.50, target:9.49, aldi:7.99, wholefoods:11.99, traderjoes:8.99 } },
  { id:"peanut-butter", name:"Creamy Peanut Butter", brand:"Jif", size:"28 oz", unitQty:28, unitName:"oz", category:"Pantry", emoji:"🥜", prices:{ smiths:4.99, walmart:4.24, costco:3.60, target:4.79, aldi:3.99, kroger:4.99 } },
  { id:"coffee", name:"Ground Coffee Medium Roast", brand:"Folgers", size:"30.5 oz", unitQty:30.5, unitName:"oz", category:"Beverages", emoji:"☕", prices:{ smiths:14.99, walmart:12.98, costco:9.99, target:13.99, aldi:10.99 } },
  { id:"oj", name:"Orange Juice", brand:"Tropicana", size:"52 fl oz", unitQty:52, unitName:"fl oz", category:"Beverages", emoji:"🍊", prices:{ smiths:4.99, walmart:4.48, costco:3.89, target:4.99, aldi:3.79, kroger:4.99 } },
  { id:"soda-12pk", name:"Cola 12-pack", brand:"Coca-Cola", size:"12 x 12 fl oz", unitQty:144, unitName:"fl oz", category:"Beverages", emoji:"🥤", prices:{ smiths:8.99, walmart:7.98, costco:6.49, target:8.49, aldi:6.99, kroger:8.99 } },
  { id:"chips", name:"Tortilla Chips", brand:"Tostitos", size:"13 oz", unitQty:13, unitName:"oz", category:"Snacks", emoji:"🌮", prices:{ smiths:4.49, walmart:3.98, costco:3.29, target:4.29, aldi:2.99 } },
  { id:"cookies", name:"Chocolate Chip Cookies", brand:"Chips Ahoy", size:"13.7 oz", unitQty:13.7, unitName:"oz", category:"Snacks", emoji:"🍪", prices:{ smiths:4.29, walmart:3.68, costco:3.10, target:4.19, aldi:2.89 } },
  { id:"ice-cream", name:"Vanilla Ice Cream", brand:"Blue Bell / Dreyer's", size:"1.5 qt", unitQty:48, unitName:"fl oz", category:"Frozen", emoji:"🍨", prices:{ smiths:5.99, walmart:5.48, costco:4.50, target:5.79, aldi:4.29, kroger:5.99 } },
  { id:"pizza-frozen", name:"Frozen Pepperoni Pizza", brand:"DiGiorno", size:"27.5 oz", unitQty:27.5, unitName:"oz", category:"Frozen", emoji:"🍕", prices:{ smiths:6.99, walmart:6.24, costco:4.99, target:6.79, aldi:4.99 } },
  { id:"paper-towels", name:"Paper Towels 12 rolls", brand:"Bounty", size:"12 double rolls", unitQty:12, unitName:"roll", category:"Household", emoji:"🧻", prices:{ smiths:18.99, walmart:16.48, costco:12.99, target:17.49, aldi:13.99 } },
  { id:"detergent", name:"Liquid Laundry Detergent", brand:"Tide", size:"92 fl oz", unitQty:92, unitName:"fl oz", category:"Household", emoji:"🧺", prices:{ smiths:15.99, walmart:13.97, costco:11.49, target:15.49, aldi:11.99 } },
  { id:"yogurt", name:"Greek Yogurt Plain", brand:"Chobani", size:"32 oz tub", unitQty:32, unitName:"oz", category:"Dairy & Eggs", emoji:"🍦", prices:{ smiths:5.49, walmart:4.97, costco:4.20, target:5.29, aldi:3.99, traderjoes:4.49, wholefoods:5.99 } },
  { id:"apples", name:"Gala Apples", brand:"Fresh", size:"per lb", unitQty:1, unitName:"lb", category:"Produce", emoji:"🍎", prices:{ smiths:1.99, walmart:1.68, costco:1.49, target:1.99, aldi:1.39, wholefoods:2.49 } },
  { id:"honey", name:"Raw Honey", brand:"Nature Nate's", size:"16 oz", unitQty:16, unitName:"oz", category:"Pantry", emoji:"🍯", prices:{ smiths:8.99, walmart:7.48, costco:5.99, target:8.49, traderjoes:6.99, wholefoods:9.99 } },
];
