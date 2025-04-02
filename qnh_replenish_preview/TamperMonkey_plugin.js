// ==UserScript==
// @name         牵牛花：补货预览单展示供应商补货数量
// @namespace    http://tampermonkey.net/
// @version      2025-04-02
// @description  仅针对【补货单预览】页面生效，可以展示供应商的订单总金额、SKU种数及补货数量
// @author       wangjunlong03@meituan.com
// @match        https://qnh.meituan.com/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=meituan.com
// @grant        none
// @homepage_url https://km.sankuai.com/collabpage/2707899029
// ==/UserScript==

(function() {
    'use strict';

    // 简化日志功能
    function log(message, data = null) {
        const timestamp = new Date().toISOString();
        console.log(`[补货单统计] ${timestamp} - ${message}`, data || '');
    }

    // 创建日志显示区域
    function createLogDiv() {
        const div = document.createElement('div');
        div.id = 'replenish-log';
        div.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        width: 300px;
        height: 200px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px;
        overflow: auto;
        z-index: 9999;
        font-size: 12px;
    `;
    document.body.appendChild(div);
    return div;
}

    // 解析URL参数，增加新的参数
    function getUrlParams() {
        const url = window.location.href;
        log('当前URL:', url);

        const hashPart = url.split('#')[1] || '';
        const queryString = hashPart.split('?')[1] || '';
        const searchParams = new URLSearchParams(queryString);

        const params = {
            replenishPreviewOrderNo: searchParams.get('replenishPreviewOrderNo'),
            previewNo: searchParams.get('previewNo'),
            replenishListNo: searchParams.get('replenishListNo'),
            documentInformationPageNo: parseInt(searchParams.get('documentInformationPageNo')) || 1
        };

        log('URL参数解析结果:', params);
        return params;
    }

    // 获取SKU数量的新实现
    async function getMaxSubSkuNum() {
        try {
            const urlParams = getUrlParams();
            log('开始请求订单列表获取SKU数量');

            const response = await fetch('https://qnh.meituan.com/api/v1/supplychain/replenish-preorder/order-list?yodaReady=h5&csecplatform=4&csecversion=3.1.0', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'M-APPKEY': 'fe_recofesaascrm'
                },
                body: JSON.stringify({
                    replenishListNo: urlParams.replenishListNo,
                    previewNo: urlParams.previewNo,
                    replenishMode: 1,
                    pageNo: urlParams.documentInformationPageNo,
                    pageSize: 10
                })
            });

            const data = await response.json();
            log('订单列表请求成功:', data);

            if (data.data?.result?.list) {
                const targetOrder = data.data.result.list.find(
                    item => item.subPreviewNo === urlParams.replenishPreviewOrderNo
                );

                if (targetOrder) {
                    log('找到目标订单的SKU数量:', targetOrder.skuCount);
                    return targetOrder.skuCount;
                }
            }

            log('警告: 未找到匹配的SKU数量，返回0');
            return 0;
        } catch (error) {
            log('获取SKU数量时发生错误:', error);
            return 0;
        }
    }

    // 发送API请求获取SKU列表
    async function fetchSkuList(pageNo, pageSize, subPreviewNo, previewNo) {
        try {
            log(`开始请求第 ${pageNo} 页数据`, { pageNo, pageSize, subPreviewNo, previewNo });
            const response = await fetch('https://qnh.meituan.com/api/v1/supplychain/replenish-preorder/sku-list?yodaReady=h5&csecplatform=4&csecversion=3.1.0', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'M-APPKEY': 'fe_recofesaascrm'
                },
                body: JSON.stringify({
                    pageNo,
                    pageSize,
                    subPreviewNo,
                    previewNo
                })
            });
            const data = await response.json();
            log(`第 ${pageNo} 页数据请求成功:`, data);
            return data;
        } catch (error) {
            console.error('API请求失败', error);
            throw error;
        }
    }

    // 汇总供应商数据
    function summarizeSupplierData(data) {
        const supplierMap = new Map();

        data.forEach(item => {
            const price = parseFloat(item.replenishTotalPrice) || 0;
            const quantity = parseFloat(item.replenishPlanQuantity) || 0;
            const key = `${item.supplierId}-${item.supplierName}`;

            if (!supplierMap.has(key)) {
                supplierMap.set(key, {
                    supplierId: item.supplierId,
                    supplierName: item.supplierName,
                    supplyType: item.supplyType,  // 添加供应类型
                    totalPrice: price,
                    totalQuantity: quantity,
                    skuCount: 1
                });
            } else {
                const supplier = supplierMap.get(key);
                supplier.totalPrice += price;
                supplier.totalQuantity += quantity;
                supplier.skuCount += 1;
            }
        });

        // 转换为数组并按supplyType排序
        return Array.from(supplierMap.values())
            .sort((a, b) => (a.supplyType || 0) - (b.supplyType || 0));
    }

    // 显示结果
    function displayResults(supplierSummary) {
        log('开始显示结果', supplierSummary);
        const alertDiv = document.querySelector('.purchase-ant-alert.purchase-ant-alert-warning');
        if (alertDiv) {
            const totals = supplierSummary.reduce((acc, curr) => ({
                totalPrice: acc.totalPrice + curr.totalPrice,
                totalQuantity: acc.totalQuantity + curr.totalQuantity,
                totalSkuCount: acc.totalSkuCount + curr.skuCount
            }), { totalPrice: 0, totalQuantity: 0, totalSkuCount: 0 });

            const iconBase64 = 'data:image/png;base64,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';

            const html = `
            <div style="line-height: 1.5; font-size: 14px;">
                    <div style="margin-top: 5px; display: flex; align-items: center;">
                        <img src="${iconBase64}"
                             style="width: 24px; height: 24px; margin-right: 8px; vertical-align: middle;"
                        >
                        <strong> 老曹神之一手：展示供应商的补货金额和件数 </strong>
                    </div>

                    <br>

                    ${supplierSummary.map(supplier => `
                         供应类型: ${supplier.supplyType || '未知'}
                        ,  供应商ID: ${supplier.supplierId}
                        ,  供应商名称: ${supplier.supplierName}
                        ,  补货SKU种数: ${supplier.skuCount}
                        ,  总补货数(补货箱规): ${supplier.totalQuantity}
                        ,  总金额: ¥${supplier.totalPrice.toFixed(2)}
                    `).join('<br>')}

                    <div style="margin-top: 5px;">
                        <strong>总金额: ¥${totals.totalPrice.toFixed(2)}
                        ,  SKU总种数: ${totals.totalSkuCount}
                        ,  总补货数: ${totals.totalQuantity}</strong>
                    </div>
            </div>`;

alertDiv.innerHTML = html;
log('结果已显示到页面');
} else {
    log('警告: 未找到目标显示区域');
}
}

// 显示加载状态
function showLoading() {
    const alertDiv = document.querySelector('.purchase-ant-alert.purchase-ant-alert-warning');
    if (alertDiv) {
        alertDiv.innerHTML = '<strong> 供应商数据计算中... 请稍等 </strong>';
    }
}

// 主函数需要改为async
async function main() {
    try {
        showLoading();
        log('插件开始执行');
        const urlParams = getUrlParams();
        const maxSubSkuNum = await getMaxSubSkuNum();  // 修改为await调用

        const pageSize = 10;
        const totalPages = Math.ceil(maxSubSkuNum / pageSize);
        log(`需要请求 ${totalPages} 页数据`);

        let allData = [];
        for (let pageNo = 1; pageNo <= totalPages; pageNo++) {
            const response = await fetchSkuList(
                pageNo,
                pageSize,
                urlParams.replenishPreviewOrderNo,
                urlParams.previewNo
            );
            if (response.data && response.data.list) {
                allData = allData.concat(response.data.list);
                log(`第 ${pageNo} 页数据合并完成，当前总数据条数: ${allData.length}`);
            }
        }

        const supplierSummary = summarizeSupplierData(allData);
        log('供应商数据汇总完成:', supplierSummary);
        displayResults(supplierSummary);
    } catch (error) {
        log('执行过程中发生错误:', error);
        const alertDiv = document.querySelector('.purchase-ant-alert.purchase-ant-alert-warning');
        if (alertDiv) {
            alertDiv.innerHTML = '数据加载失败，请刷新页面重试';
        }
    }
}

// 检查URL是否匹配
function isUrlMatched() {
    return window.location.href.includes('purchase/replenish-dispatch/order-splitting-preview');
}

// 修改初始化逻辑
function init() {
    try {
        if (!isUrlMatched()) {
            return;
        }
        log('插件初始化开始');
        setTimeout(() => {
            main().catch(error => {
                console.error('执行失败:', error);
            });
        }, 3000);
    } catch (error) {
        console.error('初始化失败:', error);
    }
}

// 监听URL变化
function addUrlChangeListener() {
    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
        if (lastUrl !== window.location.href) {
            lastUrl = window.location.href;
            if (isUrlMatched()) {
                log('URL发生变化，重新加载数据');
                main().catch(console.error);
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// 简化启动逻辑
if (isUrlMatched()) {
    log('插件加载');
    window.addEventListener('load', () => {
        init();
        addUrlChangeListener();
    });
}

})();
