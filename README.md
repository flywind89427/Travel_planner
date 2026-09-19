# Travel Planner · 旅遊行程規劃器

純前端的行程規劃工具。沒有後端，所有行程資料只存在瀏覽器的 LocalStorage。

## 開發

```bash
npm install
npm run dev     # http://localhost:5173/（已開啟 host，同網段裝置可用內網 IP 連線）
npm run build
```

## 外部服務與資料來源

這個專案依賴三個外部服務。**除了地圖圖磚以外，其餘都只在使用者主動操作時才會呼叫。**

### 1. OpenStreetMap 圖磚

地圖底圖來自 `tile.openstreetmap.org`，attribution 由 Leaflet 顯示在地圖右下角，
另外也標示在行程面板的 footer。

- 授權：<https://www.openstreetmap.org/copyright>

### 2. Nominatim（地點搜尋）

新增／編輯地點時的搜尋。只在使用者輸入時觸發，已做 debounce。

- 使用政策：<https://operations.osmfoundation.org/policies/nominatim/>

### 3. Transitous（大眾運輸交通時間）

Route Mode 的「查詢」按鈕會呼叫 <https://api.transitous.org/>，
底層是 [MOTIS](https://github.com/motis-project/motis) 路由引擎與各交通業者公開的 GTFS。

- 不需要 API 金鑰
- **只在使用者按下「查詢」時才發送請求**，同一組（起點、終點、出發時間）會快取
- 查詢結果是臨時資料：不寫入 trip、不寫入 LocalStorage

Transitous 的使用政策要求（<https://transitous.org/api/>）：

- 專案必須是開源
- 非商業用途
- 輕量使用
- **使用 routing 這類較耗資源的端點前，需先聯絡維護者說明預期用量**

> ⚠️ 公開部署前必須完成：向 Transitous 維護者說明本專案的用途與預期用量。
> 這項尚未完成。

如果 Transitous 無法使用，Route Mode 仍可運作：會顯示錯誤或「暫時查不到路線」，
並保留「在 Google Maps 開啟」的導外連結。

### Google Maps 連結

Route Result 的「在 Google Maps 開啟」只是依
[Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
格式組出的深層連結，不呼叫任何 Google API、不需要金鑰。

## 資料

- 行程資料只存在瀏覽器 LocalStorage（key: `travel-planner:trip`）
- 沒有後端、沒有帳號、沒有任何資料上傳
- 查詢類的外部請求只送出座標與時間，不送出行程內容
