// 小工具函式。
// 註：文獻的持久化目前直接走 App 內的 localStorage；此處不再保留任何 mock 資料產生器。

export const now = () => ({ iso_datetime: new Date().toISOString() });
