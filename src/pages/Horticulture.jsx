import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx-js-style';
import StatCard from '../components/ui/StatCard';
import Spinner from '../components/ui/Spinner';
import { ErrorAlert } from '../components/ui/Alert';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { useDebounce } from 'use-debounce';
import { createPortal } from 'react-dom';
import { Toaster } from 'react-hot-toast';

export default function Horticulture() {
  const { api } = useAuth();
  const { setOrderCount } = useOutletContext() || { setOrderCount: () => { } };

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [backendStats, setBackendStats] = useState({ total: 0, total_products: 0, tagged_products: 0, untagged_products: 0 });

  const [meta, setMeta] = useState({ tags: [], orderTags: [], productTags: [], varieties: [], shipping: [], payments: [], fulfillments: [] });

  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 500);
  const [sortCol, setSortCol] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, page: 1, limit: 10 });
  const [openFilter, setOpenFilter] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Filters State
  const [tagSearch, setTagSearch] = useState('');
  const [productTagSearch, setProductTagSearch] = useState('');
  const [tagInputSearch, setTagInputSearch] = useState('');
  const [tempTagInputSearch, setTempTagInputSearch] = useState('');
  const [tagFilter, setTagFilter] = useState([]);
  const [tempTagFilter, setTempTagFilter] = useState([]);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);

  const [tempDateFrom, setTempDateFrom] = useState(null);
  const [tempDateTo, setTempDateTo] = useState(null);

  const [selectedVarieties, setSelectedVarieties] = useState([]);
  const [tempSelectedVarieties, setTempSelectedVarieties] = useState([]);
  const [varietySearch, setVarietySearch] = useState('');
  const [freeTextVarieties, setFreeTextVarieties] = useState('');
  const [tempFreeTextVarieties, setTempFreeTextVarieties] = useState('');
  const [selectedShipping, setSelectedShipping] = useState([]);
  const [tempSelectedShipping, setTempSelectedShipping] = useState([]);
  const [shippingSearch, setShippingSearch] = useState('');
  const [excludeDelayed, setExcludeDelayed] = useState(false);

  // New Filters
  const [customerSearch, setCustomerSearch] = useState('');
  const [tempCustomerSearch, setTempCustomerSearch] = useState('');

  const [orderSearch, setOrderSearch] = useState('');
  const [tempOrderSearch, setTempOrderSearch] = useState('');

  const [amountFrom, setAmountFrom] = useState('');
  const [amountTo, setAmountTo] = useState('');

  const [tempAmountFrom, setTempAmountFrom] = useState('');
  const [tempAmountTo, setTempAmountTo] = useState('');

  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState([]);
  const [selectedFulfillmentStatus, setSelectedFulfillmentStatus] = useState([]);

  const [selectedOrders, setSelectedOrders] = useState([]);

  const pollingRef = useRef(null);

  // Actions State
  const [bulkTagText, setBulkTagText] = useState('');
  const [tagging, setTagging] = useState(false);
  const [fulfilling, setFulfilling] = useState(false);

  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: '',
    message: '',
    onConfirm: null,
    type: 'default'
  });

  // Royal Mail / shipping automation state
  const [actionLoading, setActionLoading] = useState(false);
  const [rmPanel, setRmPanel] = useState(false);
  const [rmDespatchDate, setRmDespatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rmStep, setRmStep] = useState('idle'); // idle | creating | labelling | manifesting | done
  const [rmResults, setRmResults] = useState([]);
  const [rmIdentifiers, setRmIdentifiers] = useState([]);
  const [rmError, setRmError] = useState('');

  // DPD automation state
  const [dpdPanel, setDpdPanel] = useState(false);
  const [dpdDespatchDate, setDpdDespatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dpdStep, setDpdStep] = useState('idle'); // idle | creating | labelling | done
  const [dpdResults, setDpdResults] = useState([]);
  const [dpdConsignments, setDpdConsignments] = useState([]);
  const [dpdError, setDpdError] = useState('');

  // Email notification state
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyPanel, setNotifyPanel] = useState(false);
  const [notifyResults, setNotifyResults] = useState([]);

  // Variety filter mode: 'include' = show orders WITH selected varieties, 'exclude' = show orders WITHOUT
  const [varietyFilterMode, setVarietyFilterMode] = useState('include');
  const [tempVarietyFilterMode, setTempVarietyFilterMode] = useState('include');

  const loadOrders = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({
        page: page,
        limit: limit,
        search: debouncedSearch,
        tags:
          [
            ...tagFilter,
            ...tagInputSearch
              .split(',')
              .map(v => v.trim())
              .filter(Boolean)
          ].join(','),
        ...(varietyFilterMode === 'include'
          ? {
              varieties: [
                ...selectedVarieties,
                ...freeTextVarieties.split(/[\n,;]+/).map(v => v.trim()).filter(Boolean)
              ].join(','),
            }
          : {
              varieties_exclude: [
                ...selectedVarieties,
                ...freeTextVarieties.split(/[\n,;]+/).map(v => v.trim()).filter(Boolean)
              ].join(','),
            }
        ),
        shipping: selectedShipping.join(','),
        order_number: orderSearch,
        customer: customerSearch,
        amount_min: amountFrom,
        amount_max: amountTo,
        fulfillment_status: selectedFulfillmentStatus.join(','),
        financial_status: selectedPaymentStatus.join(','),
        created_at_min: dateFrom ? startOfDay(dateFrom).toISOString() : '',
        created_at_max: dateTo ? endOfDay(dateTo).toISOString() : '',
        sort: sortCol === 'date' ? 'created_at' :
          sortCol === 'order' ? 'order_number' :
            sortCol === 'amount' ? 'total_price' :
              sortCol === 'payment' ? 'financial_status' :
                sortCol === 'fulfillment' ? 'fulfillment_status' : sortCol,
        direction: sortDir
      });

      const r = await api(`${import.meta.env.VITE_API_URL}/api/orders?${params.toString()}`);
      const d = await r.json();
      if (r.ok) {
        setOrders(d.orders || []);
        setPagination(d.pagination || { total: 0, totalPages: 1, page: 1, limit: 10 });
        setOrderCount(d.pagination?.total || (d.orders || []).length);
        setBackendStats(d.stats || { total: 0, total_products: 0, tagged_products: 0, untagged_products: 0 });
      } else {
        setError(d.message);
      }
    } catch {
      setError('Cannot connect to backend.');
    }
    setLoading(false);
  }, [api, setOrderCount, page, limit, debouncedSearch, tagFilter, orderSearch, customerSearch, amountFrom, amountTo, selectedFulfillmentStatus, selectedPaymentStatus, dateFrom, dateTo, sortCol, sortDir, selectedVarieties, freeTextVarieties, selectedShipping, varietyFilterMode]);

  const handleApplyAmount = () => {
    setAmountFrom(tempAmountFrom);
    setAmountTo(tempAmountTo);
    setPage(1);
    setOpenFilter(null);
  };

  const filteredOrderTags = useMemo(() => {
    return (meta.orderTags || []).filter(tag =>
      tag.toLowerCase().includes(tagSearch.toLowerCase())
    );
  }, [meta.orderTags, tagSearch]);

  const filteredProductTags = useMemo(() => {
    return (meta.productTags || []).filter(tag =>
      tag.toLowerCase().includes(productTagSearch.toLowerCase())
    );
  }, [meta.productTags, productTagSearch]);

  const filteredVarieties = useMemo(() => {
    return meta.varieties.filter(v =>
      v.toLowerCase().includes(varietySearch.toLowerCase())
    );
  }, [meta.varieties, varietySearch]);

  const groupedVarieties = useMemo(() => {
    const groups = {};
    filteredVarieties.forEach(v => {
      // Try to extract a group prefix (e.g. "Lavender - Hidcote" -> "Lavender")
      const match = v.match(/^([^:-]+)\s*[-:]/);
      const groupName = match ? match[1].trim() : 'Other';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(v);
    });
    return groups;
  }, [filteredVarieties]);

  const filteredShipping = useMemo(() => {
    return meta.shipping.filter(s =>
      s.toLowerCase().includes(shippingSearch.toLowerCase())
    );
  }, [meta.shipping, shippingSearch]);

  const handleApplyOrderSearch = () => {

    const formatted =
      tempOrderSearch
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
        .join(',');

    setOrderSearch(formatted);

    setPage(1);

    setOpenFilter(null);
  };

  const handleApplyCustomerSearch = () => {
    setCustomerSearch(tempCustomerSearch);
    setPage(1);
    setOpenFilter(null);
  };

  const handleApplyTagSearch = () => {
    const formatted =
      tempTagInputSearch
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
        .join(',');

    setTagInputSearch(formatted);
    setTagFilter(tempTagFilter);
    setPage(1);
    setOpenFilter(null);
  };

  const handleApplyDate = () => {
    setPage(1);

    setDateFrom(tempDateFrom);
    setDateTo(tempDateTo);

    setOpenFilter(null);
  };

  const loadMeta = useCallback(async () => {
    try {
      const r = await api(`${import.meta.env.VITE_API_URL}/api/orders/meta`);
      if (r.ok) setMeta(await r.json());
    } catch (e) { console.error("Meta load failed", e); }
  }, [api]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  // ── Sync from Shopify ────────────────────────────────────────────────────
  const syncOrders = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await api(`${import.meta.env.VITE_API_URL}/api/orders/sync`, { method: 'POST', body: {} });
      const d = await r.json();
      if (r.ok) await loadOrders();
      else setError(d.message);
    } catch {
      setError('Sync failed.');
    }
    setSyncing(false);
  }, [api, loadOrders]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Listen for topbar button events
  useEffect(() => {
    window.addEventListener('orders:refresh', loadOrders);
    window.addEventListener('orders:sync', syncOrders);
    return () => {
      window.removeEventListener('orders:refresh', loadOrders);
      window.removeEventListener('orders:sync', syncOrders);
    };
  }, [loadOrders, syncOrders]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = () => setOpenFilter(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Filter 1: Base Step 2 filtering for available varieties
  const step2FilteredOrders = orders;

  const availableVarieties = useMemo(() => {
    const vars = new Set();
    step2FilteredOrders.forEach(o => {
      (o.line_items || []).forEach(item => { if (item.title) vars.add(item.title); });
    });
    return Array.from(vars).sort();
  }, [step2FilteredOrders]);

  const availableShipping = useMemo(() => {
    const methods = new Set();
    orders.forEach(o => {
      (o.shipping_lines || []).forEach(line => { if (line.title) methods.add(line.title); });
    });
    return Array.from(methods).sort();
  }, [orders]);

  const getParsedFreeTextVarieties = () => {
    if (!freeTextVarieties.trim()) return [];
    return freeTextVarieties.split(/[\n,;]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
  };

  // Filter 2: Final filter application
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    let list = step2FilteredOrders.filter(o => {
      // search, customerSearch, orderSearch, paymentStatus, fulfillmentStatus, amount, and date are now handled by backend

      if (excludeDelayed) {
        const note = (o.note || '').toLowerCase();
        const tags = (o.tags || '').toLowerCase();
        if (note.includes('delay') || tags.includes('delay') || note.includes('special')) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      let va, vb;
      if (sortCol === 'order') {
        va = Number(a.order_number || 0);
        vb = Number(b.order_number || 0);
      }
      else if (sortCol === 'customer') {
        va = a.customer
          ? `${a.customer.first_name} ${a.customer.last_name}`.toLowerCase()
          : '';

        vb = b.customer
          ? `${b.customer.first_name} ${b.customer.last_name}`.toLowerCase()
          : '';
      }
      else if (sortCol === 'date') {
        va = new Date(a.created_at).getTime();
        vb = new Date(b.created_at).getTime();
      }
      else if (sortCol === 'amount') {
        va = parseFloat(a.total_price || 0);
        vb = parseFloat(b.total_price || 0);
      }
      else if (sortCol === 'payment') {
        va = (a.financial_status || '').toLowerCase();
        vb = (b.financial_status || '').toLowerCase();
      }
      else if (sortCol === 'fulfillment') {
        va = (a.fulfillment_status || '').toLowerCase();
        vb = (b.fulfillment_status || '').toLowerCase();
      }
      else {
        return 0;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [step2FilteredOrders, search, customerSearch, orderSearch, amountFrom, amountTo, selectedPaymentStatus, selectedFulfillmentStatus, sortCol, sortDir, excludeDelayed, selectedShipping]);

  // Stats for the 4 cards at the top
  const stats = useMemo(() => {
    let orderCount = filtered.length;
    let totalItems = 0;
    let taggedCount = 0;
    let untaggedCount = 0;

    filtered.forEach(o => {
      const orderTags = (o.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      let orderItemCount = 0;
      (o.line_items || []).forEach(item => { orderItemCount += (item.quantity || 1); });

      totalItems += orderItemCount;
      if (orderTags.length > 0) taggedCount += orderItemCount;
      else untaggedCount += orderItemCount;
    });

    return { orderCount, totalItems, taggedCount, untaggedCount };
  }, [filtered]);

  const totalPages = pagination.totalPages;
  const pageStart = (pagination.page - 1) * pagination.limit;
  const pageEnd = pageStart + orders.length;
  const pageSlice = filtered; // Since filtered is already paginated by backend

  const activeFilterCount = (tagFilter.length || tagInputSearch ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (selectedVarieties.length > 0 || freeTextVarieties ? 1 : 0) + (selectedShipping.length > 0 ? 1 : 0) + (excludeDelayed ? 1 : 0) + (customerSearch ? 1 : 0) + (orderSearch ? 1 : 0) + (amountFrom || amountTo ? 1 : 0) + (selectedPaymentStatus.length > 0 ? 1 : 0) + (selectedFulfillmentStatus.length > 0 ? 1 : 0);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(1);
  };

  const clearAllFilters = () => {
    setTagFilter([]);
    setTagInputSearch('');
    setTempTagInputSearch('');
    setTagSearch('');
    setProductTagSearch('');
    setVarietySearch('');
    setShippingSearch('');
    setDateFrom(null);
    setDateTo(null);
    setSelectedVarieties([]);
    setTempSelectedVarieties([]);
    setFreeTextVarieties('');
    setVarietyFilterMode('include');
    setTempVarietyFilterMode('include');
    setSelectedShipping([]);
    setTempSelectedShipping([]);
    setExcludeDelayed(false);
    setSearch('');
    setSortCol('date');
    setSortDir('desc');
    setPage(1);
    setLimit(10);
    setCustomerSearch('');
    setOrderSearch('');
    setAmountFrom('');
    setAmountTo('');
    setSelectedPaymentStatus([]);
    setSelectedFulfillmentStatus([]);
  };

  const handleSelectAll = (checked) => {

    if (checked) {

      setSelectedOrders(
        filtered.map(o => o.id)
      );

    } else {

      setSelectedOrders([]);
    }
  };

  const handleSelectOrder = (orderId, checked) => {

    if (checked) {

      setSelectedOrders(prev => [
        ...prev,
        orderId
      ]);

    } else {

      setSelectedOrders(prev =>
        prev.filter(id => id !== orderId)
      );
    }
  };

  // Actions
  const handleBulkTag = async () => {

    if (!bulkTagText.trim()) {

      const toast =
        (await import('react-hot-toast')).default;

      toast.error(
        'Please enter a tag'
      );

      return;
    }

    const orderIds =
      selectedOrders.length > 0
        ? selectedOrders
        : filtered.map(o => o.id);

    if (orderIds.length === 0) {

      const toast =
        (await import('react-hot-toast')).default;

      toast.error(
        'No orders selected'
      );

      return;
    }

    setConfirmModal({
      open: true,
      type: 'warning',
      title: 'Apply Bulk Tag',
      message: `Apply tag "${bulkTagText}" to ${orderIds.length} order(s)?`,

      onConfirm: async () => {

        setConfirmModal(prev => ({
          ...prev,
          open: false
        }));

        try {

          setBulkProcessing(true);

          const toast =
            (await import('react-hot-toast')).default;

          toast.loading(
            'Tagging started in background...',
            {
              id: 'bulk-tag'
            }
          );

          const res = await api(
            `${import.meta.env.VITE_API_URL}/api/orders/bulk-tag`,
            {
              method: 'POST',
              body: {
                orderIds,
                tag: bulkTagText
              }
            }
          );

          const data =
            await res.json();

          if (!res.ok) {

            setBulkProcessing(false);

            const toast =
              (await import('react-hot-toast')).default;

            toast.error(
              data.message || 'Request failed'
            );

            return;
          }

          // ============================================
          // POLLING
          // ============================================

          if (pollingRef.current) {
            clearInterval(pollingRef.current);
          }

          pollingRef.current =
            setInterval(async () => {

              const statusRes =
                await api(
                  `${import.meta.env.VITE_API_URL}/api/orders/job-status/${data.jobId}`
                );

              const status =
                await statusRes.json();

              if (
                status.status === 'completed'
              ) {

                clearInterval(pollingRef.current);

                pollingRef.current = null;

                toast.success(
                  `Completed: ${status.completed} tagged`,
                  {
                    id: 'bulk-tag'
                  }
                );

                setSelectedOrders([]);

                await loadOrders();
              }

              if (
                status.status === 'failed'
              ) {

                clearInterval(pollingRef.current);

                setBulkProcessing(false);

                pollingRef.current = null;

                toast.error(
                  'Bulk tagging failed',
                  {
                    id: 'bulk-tag'
                  }
                );
              }

            }, 5000);

        } catch (err) {

          setBulkProcessing(false);

          console.error(err);

          const toast =
            (await import('react-hot-toast')).default;

          toast.error(
            err.message || 'Failed'
          );
        }
      }
    });
  };

  const handleBulkFulfill = async (
    specificIds = null
  ) => {

    // prevent React event object
    if (
      specificIds &&
      typeof specificIds === 'object' &&
      specificIds.nativeEvent
    ) {
      specificIds = null;
    }

    const idsToFulfill =
      specificIds ||
      (
        selectedOrders.length > 0
          ? selectedOrders
          : filtered.map(o => o.id)
      );

    // ============================================
    // VALIDATION
    // ============================================

    if (idsToFulfill.length === 0) {

      const toast =
        (await import('react-hot-toast')).default;

      toast.error(
        'No orders selected'
      );

      return;
    }

    // ============================================
    // CONFIRM MODAL
    // ============================================

    setConfirmModal({
      open: true,
      type: 'success',
      title: 'Mark Orders as Fulfilled',

      message:
        `Are you sure you want to mark ${idsToFulfill.length} order(s) as fulfilled?`,

      onConfirm: async () => {

        setConfirmModal(prev => ({
          ...prev,
          open: false
        }));

        try {

          setFulfilling(true);

          const toast =
            (await import('react-hot-toast')).default;

          // ============================================
          // START TOAST
          // ============================================

          toast.loading(
            'Fulfillment started in background...',
            {
              id: 'bulk-fulfill'
            }
          );

          // ============================================
          // START BACKGROUND JOB
          // ============================================

          const res = await api(
            `${import.meta.env.VITE_API_URL}/api/orders/bulk-fulfill`,
            {
              method: 'POST',
              body: {
                orderIds: idsToFulfill
              }
            }
          );

          const data =
            await res.json();

          if (!res.ok) {

            toast.error(
              data.message ||
              'Failed to start fulfillment',
              {
                id: 'bulk-fulfill'
              }
            );

            return;
          }

          // ============================================
          // POLLING
          // ============================================

          if (pollingRef.current) {
            clearInterval(pollingRef.current);
          }

          pollingRef.current =
            setInterval(async () => {

              try {

                const statusRes =
                  await api(
                    `${import.meta.env.VITE_API_URL}/api/orders/job-status/${data.jobId}`
                  );

                const status =
                  await statusRes.json();

                // ============================================
                // PROCESSING
                // ============================================

                if (
                  status.status === 'processing'
                ) {

                  toast.loading(
                    `Processing ${status.completed + status.failed}/${status.total} orders...`,
                    {
                      id: 'bulk-fulfill'
                    }
                  );
                }

                // ============================================
                // COMPLETED
                // ============================================

                if (
                  status.status === 'completed'
                ) {

                  setFulfilling(false);

                  clearInterval(pollingRef.current);

                  pollingRef.current = null;

                  toast.success(
                    `Fulfilled ${status.completed} order(s) successfully`,
                    {
                      id: 'bulk-fulfill'
                    }
                  );

                  if (status.failed > 0) {

                    setTimeout(() => {

                      toast.error(
                        `${status.failed} order(s) failed`,
                      );

                    }, 500);
                  }

                  setSelectedOrders([]);

                  await loadOrders();
                }

                // ============================================
                // FAILED
                // ============================================

                if (
                  status.status === 'failed'
                ) {

                  setFulfilling(false);

                  clearInterval(pollingRef.current);

                  pollingRef.current = null;

                  toast.error(
                    status.error ||
                    'Background fulfillment failed',
                    {
                      id: 'bulk-fulfill'
                    }
                  );
                }

              } catch (err) {

                clearInterval(pollingRef.current);

                pollingRef.current = null;

                toast.error(
                  'Unable to fetch job status',
                  {
                    id: 'bulk-fulfill'
                  }
                );
              }

            }, 5000);

        } catch (err) {

          setFulfilling(false);

          console.error(err);

          const toast =
            (await import('react-hot-toast')).default;

          toast.error(
            err.message ||
            'Failed to fulfill orders',
            {
              id: 'bulk-fulfill'
            }
          );
        }
      }
    });
  };

  useEffect(() => {

    return () => {

      if (pollingRef.current) {

        clearInterval(
          pollingRef.current
        );
      }
    };

  }, []);

  // ── Shipping helpers ─────────────────────────────────────────────────────
  const getShipOrderIds = () =>
    selectedOrders.length > 0 ? selectedOrders : filtered.map(o => o.id);

  const exportShippingCsv = async (carrier) => {
    const orderIds = getShipOrderIds();
    if (!orderIds.length) return;
    setActionLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/orders/shipping-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderIds, carrier }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${carrier.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const toast = (await import('react-hot-toast')).default;
      toast.error(err.message || 'Export failed');
    }
    setActionLoading(false);
  };

  const rmCreateShipments = async () => {
    const orderIds = getShipOrderIds();
    if (!orderIds.length) return;
    setRmStep('creating');
    setRmError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/orders/royal-mail-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderIds, despatchDate: rmDespatchDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create shipments');
      setRmResults(data.results || []);
      setRmIdentifiers((data.results || []).filter(r => r.orderIdentifier).map(r => r.orderIdentifier));
      setRmStep('labelling');
    } catch (err) {
      setRmError(err.message);
      setRmStep('idle');
    }
  };

  const rmDownloadLabels = async () => {
    if (!rmIdentifiers.length) return;
    setRmStep('labelling');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/orders/royal-mail-labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rmOrderIdentifiers: rmIdentifiers }),
      });
      if (!res.ok) throw new Error('Label download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `royal_mail_labels_${rmDespatchDate}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setRmStep('done');
    } catch (err) {
      setRmError(err.message);
      setRmStep('done');
    }
  };

  const rmCreateManifest = async () => {
    setRmStep('manifesting');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/orders/royal-mail-manifest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Manifest creation failed');
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('pdf')) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `manifest_${rmDespatchDate}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setRmStep('done');
    } catch (err) {
      setRmError(err.message);
      setRmStep('done');
    }
  };

  // ── DPD automation handlers ──────────────────────────────────────────────
  const dpdCreateShipments = async () => {
    const orderIds = getShipOrderIds();
    if (!orderIds.length) return;
    setDpdStep('creating');
    setDpdError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/orders/dpd-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderIds, despatchDate: dpdDespatchDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create DPD shipments');
      setDpdResults(data.results || []);
      setDpdConsignments((data.results || []).filter(r => r.consignmentNumber).map(r => r.consignmentNumber));
      setDpdStep('labelling');
    } catch (err) {
      setDpdError(err.message);
      setDpdStep('idle');
    }
  };

  const dpdDownloadLabels = async () => {
    if (!dpdConsignments.length) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/orders/dpd-labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ consignmentNumbers: dpdConsignments }),
      });
      if (!res.ok) throw new Error('Label download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dpd_labels_${dpdDespatchDate}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setDpdStep('done');
    } catch (err) {
      setDpdError(err.message);
      setDpdStep('done');
    }
  };

  // ── Customer email notification ──────────────────────────────────────────
  const sendCustomerNotifications = async () => {
    const orderIds = selectedOrders.length > 0 ? selectedOrders : filtered.map(o => o.id);
    if (!orderIds.length) return;
    setNotifyLoading(true);
    setNotifyResults([]);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/orders/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setNotifyResults(data.results || []);
      setNotifyPanel(true);
    } catch (err) {
      const toast = (await import('react-hot-toast')).default;
      toast.error(err.message || 'Failed to send notifications');
    }
    setNotifyLoading(false);
  };

  // Build filter params used by the GET report endpoints
  const buildReportParams = () => {
    // If orders are selected, bypass all filters and use just those IDs
    if (selectedOrders.length > 0) {
      return new URLSearchParams({ order_ids: selectedOrders.join(',') });
    }
    return new URLSearchParams({
      search,
      order_number: orderSearch,
      customer: customerSearch,
      amount_min: amountFrom,
      amount_max: amountTo,
      fulfillment_status: selectedFulfillmentStatus.join(','),
      financial_status: selectedPaymentStatus.join(','),
      created_at_min: dateFrom ? startOfDay(dateFrom).toISOString() : '',
      created_at_max: dateTo ? endOfDay(dateTo).toISOString() : '',
    });
  };

  const generateSummaryReport = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = buildReportParams();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/orders/preorder-summary-report?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Failed to generate report');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'PREORDER_TOTALS.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Failed to generate summary report');
    }
  };

  const generatePackingSlip = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = buildReportParams();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/orders/packing-slip-report?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Failed to generate report');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'HORT_PACKING_SLIP.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Failed to generate packing slip');
    }
  };

  const generateOrderPackingSlips = async () => {
    const orderIds = selectedOrders.length > 0 ? selectedOrders : filtered.map(o => o.id);
    if (!orderIds.length) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/orders/order-packing-slips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      const html = await res.text();
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); }
    } catch (err) {
      console.error(err);
      alert('Failed to generate order packing slips');
    }
  };

  const allTags = useMemo(() => {
    const tags = new Set();
    orders.forEach(o => {
      if (o.tags) o.tags.split(',').forEach(t => tags.add(t.trim()));
    });
    return Array.from(tags).sort();
  }, [orders]);

  function StatusBadge({ status, type }) {

    const normalized =
      (status || '').toLowerCase();

    const configs = {

      paid: {
        label: 'Paid',
        cls: 'bg-slate-100 text-slate-700',
        dot: 'bg-slate-500'
      },

      pending: {
        label: 'Pending',
        cls: 'bg-yellow-100 text-yellow-800',
        dot: 'bg-yellow-500'
      },

      authorized: {
        label: 'Authorized',
        cls: 'bg-blue-100 text-blue-800',
        dot: 'bg-blue-500'
      },

      partially_paid: {
        label: 'Partially paid',
        cls: 'bg-orange-100 text-orange-800',
        dot: 'bg-orange-500'
      },

      refunded: {
        label: 'Refunded',
        cls: 'bg-slate-100 text-slate-700',
        dot: 'bg-slate-500'
      },

      partially_refunded: {
        label: 'Partially refunded',
        cls: 'bg-slate-100 text-slate-700',
        dot: 'bg-slate-500'
      },

      voided: {
        label: 'Voided',
        cls: 'bg-slate-100 text-slate-700',
        dot: 'bg-slate-500'
      },

      fulfilled: {
        label: 'Fulfilled',
        cls: 'bg-slate-100 text-slate-700',
        dot: 'bg-slate-500'
      },

      unfulfilled: {
        label: 'Unfulfilled',
        cls: 'bg-yellow-100 text-yellow-900',
        dot: 'bg-yellow-600'
      },

      partial: {
        label: 'Partial',
        cls: 'bg-orange-100 text-orange-800',
        dot: 'bg-orange-500'
      },

    };

    const fallback =
      type === 'payment'
        ? configs.pending
        : configs.unfulfilled;

    const cfg =
      configs[normalized] || fallback;

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}
      >
        <span
          className={`w-2 h-2 rounded-full ${cfg.dot}`}
        />

        {cfg.label}
      </span>
    );
  }

  return (
    <div className="space-y-5">
      {syncing && (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl px-4 py-3 text-sm font-medium">
          <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
          Syncing orders from Shopify…
        </div>
      )}
      <ErrorAlert message={error} />

      {/* Top 4 Stat Cards replacing the big boxes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="📦" value={backendStats.total} label="Total Orders" tag="Filtered" tagCls="bg-indigo-50 text-indigo-600" borderCls="border-l-indigo-500" />
        <StatCard icon="🌱" value={backendStats.total_products} label="Total Products" tag="Items" tagCls="bg-emerald-50 text-emerald-600" borderCls="border-l-emerald-500" />
        <StatCard icon="🏷️" value={backendStats.tagged_products} label="Tagged Products" tag="Matching" tagCls="bg-blue-50 text-blue-600" borderCls="border-l-blue-500" />
        <StatCard icon="⚪" value={backendStats.untagged_products} label="Untagged Products" tag="No Tag" tagCls="bg-slate-100 text-slate-600" borderCls="border-l-slate-400" />
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-visible">

        {/* Toolbar */}
        <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-4 px-4 sm:px-5 py-4 border-b border-slate-100">

          {/* LEFT */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">

            <h3 className="text-sm sm:text-base font-bold text-slate-800 whitespace-nowrap">
              Filtered Orders
            </h3>

            <span className="bg-indigo-50 text-indigo-600 text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap">
              {filtered.length} records
            </span>

            {activeFilterCount > 0 && (
              <span className="bg-amber-50 text-amber-600 text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap">
                {activeFilterCount} active filters
              </span>
            )}

          </div>

          {/* RIGHT */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 w-full 2xl:w-auto">

            {/* SHIPPING CARRIER BUTTONS */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setRmPanel(true);
                  setRmStep('idle');
                  setRmResults([]);
                  setRmIdentifiers([]);
                  setRmError('');
                }}
                disabled={actionLoading}
                className="px-3 py-2 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 text-xs font-bold rounded-lg border border-red-200 transition cursor-pointer whitespace-nowrap"
              >
                📮 Royal Mail
              </button>
              <button
                onClick={() => {
                  setDpdPanel(true);
                  setDpdStep('idle');
                  setDpdResults([]);
                  setDpdConsignments([]);
                  setDpdError('');
                }}
                disabled={actionLoading}
                className="px-3 py-2 bg-orange-50 hover:bg-orange-100 disabled:opacity-50 text-orange-700 text-xs font-bold rounded-lg border border-orange-200 transition cursor-pointer whitespace-nowrap"
              >
                📦 DPD
              </button>
            </div>

            {/* REPORT BUTTONS */}
            <div className="grid grid-cols-2 sm:flex gap-2">

              <button
                onClick={generateSummaryReport}
                className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 transition cursor-pointer whitespace-nowrap"
              >
                📊 Summary per Variety
              </button>

              <button
                onClick={generatePackingSlip}
                className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg border border-blue-200 transition cursor-pointer whitespace-nowrap"
              >
                🌿 Hort Packing Slip
              </button>

              <button
                onClick={generateOrderPackingSlips}
                className="px-3 py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold rounded-lg border border-violet-200 transition cursor-pointer whitespace-nowrap"
              >
                🖨 Order Packing Slips
              </button>

              <button
                onClick={sendCustomerNotifications}
                disabled={notifyLoading}
                className="px-3 py-2 bg-teal-50 hover:bg-teal-100 disabled:opacity-50 text-teal-700 text-xs font-bold rounded-lg border border-teal-200 transition cursor-pointer whitespace-nowrap"
              >
                {notifyLoading ? '📧 Sending…' : '📧 Notify Customer'}
              </button>

            </div>

            {selectedOrders.length > 0 && (
              <span className="bg-green-50 text-green-600 text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap">
                {selectedOrders.length} selected
              </span>
            )}

            {/* BULK ACTIONS */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2">

              <input
                type="text"
                value={bulkTagText}
                onChange={e => setBulkTagText(e.target.value)}
                placeholder="SEND DD/MM/YY"
                className="w-full sm:w-36 px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
              />

              <div className="grid grid-cols-2 gap-2 sm:flex">

                <button
                  onClick={() => handleBulkTag()}
                  disabled={bulkProcessing}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer"
                >
                  {tagging ? 'Tagging...' : 'Tag'}
                </button>

                <button
                  onClick={() => handleBulkFulfill()}
                  disabled={fulfilling}
                  className="px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer"
                >
                  {fulfilling ? 'Processing...' : 'Fulfill'}
                </button>

              </div>

            </div>

            {/* CLEAR BUTTON */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer"
              >
                ✕ Clear Filters
              </button>
            )}

          </div>

        </div>

        {/* Search Bar Row (Optional, if you still want generic search) */}
        <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex gap-4">
          <div className="relative w-full max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search order, customer…" className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-400 outline-none transition" />
          </div>
        </div>

        {/* Table */}

        {/* <div className="relative">
          <div
            className="overflow-auto rounded-b-2xl"
            style={{
              maxHeight: 'calc(100vh - 440px)',
            }}
          > */}
        <div className="relative overflow-visible">
          <div
            className="overflow-x-auto"
            style={{
              position: 'static',
            }}
          >
            <table
              className="w-full text-left table-auto"
              style={{
                overflow: 'visible',
              }}
            >
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                <tr>
                  <th className="px-4 py-3 w-12">
                    <input
                      type="checkbox"
                      checked={
                        filtered.length > 0 &&
                        selectedOrders.length === filtered.length
                      }
                      onChange={(e) =>
                        handleSelectAll(e.target.checked)
                      }
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <ThFilter col="order" label="Order" active={!!orderSearch} handleSort={handleSort} sortCol={sortCol} sortDir={sortDir} setOpenFilter={setOpenFilter} openFilter={openFilter}>
                    <input
                      type="text"
                      value={tempOrderSearch}
                      onChange={e => setTempOrderSearch(e.target.value)}
                      placeholder="Search order #"
                      className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded bg-slate-50 outline-none mb-2"
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setTempOrderSearch('');
                          setOrderSearch('');
                          setPage(1);
                          setOpenFilter(null);
                        }}
                        className="flex-1 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded cursor-pointer"
                      >
                        Clear
                      </button>

                      <button
                        onClick={handleApplyOrderSearch}
                        className="flex-1 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded cursor-pointer"
                      >
                        Apply
                      </button>
                    </div>
                  </ThFilter>

                  <ThFilter col="customer" label="Customer" active={!!customerSearch} handleSort={handleSort} sortCol={sortCol} sortDir={sortDir} setOpenFilter={setOpenFilter} openFilter={openFilter}>
                    <input
                      type="text"
                      value={tempCustomerSearch}
                      onChange={e => setTempCustomerSearch(e.target.value)}
                      placeholder="Name or email"
                      className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded bg-slate-50 outline-none mb-2"
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setTempCustomerSearch('');
                          setCustomerSearch('');
                          setPage(1);
                          setOpenFilter(null);
                        }}
                        className="flex-1 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded cursor-pointer"
                      >
                        Clear
                      </button>

                      <button
                        onClick={handleApplyCustomerSearch}
                        className="flex-1 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded cursor-pointer"
                      >
                        Apply
                      </button>
                    </div>
                  </ThFilter>

                  <ThFilter col="date" label="Date" active={dateFrom || dateTo} dropdownWidth="w-[280px]" handleSort={handleSort} sortCol={sortCol} sortDir={sortDir} setOpenFilter={setOpenFilter} openFilter={openFilter}>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">From Date</label>
                        <DatePicker
                          selected={tempDateFrom}
                          onChange={(date) => setTempDateFrom(date)}
                          placeholderText="Select date"
                          className="w-full mt-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 outline-none transition"
                          dateFormat="dd/MM/yyyy"
                          isClearable
                          showPopperArrow={false}
                          popperPlacement="bottom-start"
                          popperProps={{
                            strategy: 'fixed',
                          }}
                        />
                      </div>
                      <div className="pt-2">
                        <label className="text-xs font-bold text-slate-600 block mb-1">To Date</label>
                        <DatePicker
                          selected={tempDateTo}
                          onChange={(date) => setTempDateTo(date)}
                          placeholderText="Select date"
                          className="w-full mt-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 outline-none transition"
                          dateFormat="dd/MM/yyyy"
                          isClearable
                          showPopperArrow={false}
                          popperPlacement="bottom-start"
                          popperProps={{
                            strategy: 'fixed',
                          }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setTempDateFrom(null);
                            setTempDateTo(null);

                            setDateFrom(null);
                            setDateTo(null);

                            setPage(1);
                            setOpenFilter(null);
                          }}
                          className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition cursor-pointer"
                        >
                          Clear
                        </button>

                        <button
                          onClick={handleApplyDate}
                          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </ThFilter>

                  <ThFilter
                    col="tags"
                    label="Tags"
                    sortable={false}
                    active={tagFilter.length > 0 || tagInputSearch.length > 0}
                    dropdownWidth="w-72"
                    handleSort={handleSort}
                    sortCol={sortCol}
                    sortDir={sortDir}
                    setOpenFilter={(value) => {
                      if (value === 'tags') {
                        setTempTagFilter(tagFilter);
                      }
                      setOpenFilter(value);
                    }}
                    openFilter={openFilter}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[12px] font-bold text-slate-400 uppercase tracking-tight px-1 rounded">
                          Order Tags
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setTempTagFilter(prev => {
                                const newSet = new Set([
                                  ...prev,
                                  ...filteredOrderTags
                                ]);

                                return Array.from(newSet);
                              });
                            }}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                          >
                            Select All
                          </button>

                          <button
                            onClick={() => {
                              setTempTagFilter(prev =>
                                prev.filter(tag =>
                                  !filteredOrderTags.includes(tag)
                                )
                              );
                            }}
                            className="text-[10px] font-bold text-red-500 hover:text-red-700 cursor-pointer"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        placeholder="Filter tags..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-400"
                      />

                      <div className="max-h-64 overflow-y-auto border border-slate-200 rounded bg-slate-50 p-2 space-y-4">
                        {/* ORDER TAGS SECTION */}
                        <div className="space-y-1">
                          <div className="space-y-1 pl-1">
                            {filteredOrderTags.map(t => (
                              <label key={`order-${t}`} className="flex items-center gap-2 cursor-pointer py-1 group">
                                <input
                                  type="checkbox"
                                  checked={tempTagFilter.includes(t)}
                                  onChange={(e) => {
                                    if (e.target.checked) setTempTagFilter(prev => [...prev, t]);
                                    else setTempTagFilter(prev => prev.filter(x => x !== t));
                                  }}
                                  className="rounded text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-xs text-slate-700 group-hover:text-indigo-600 transition-colors">{t}</span>
                              </label>
                            ))}
                            {filteredOrderTags.length === 0 && <div className="text-[10px] text-slate-400 italic pl-1">No matches</div>}
                          </div>
                        </div>

                        {/* PRODUCT TAGS SECTION */}

                        {filteredOrderTags.length === 0 && (
                          <div className="text-xs text-slate-400 py-2 text-center">
                            No order tags found
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[12px] font-bold text-slate-400 uppercase tracking-tight px-1 rounded">
                          Product Tags
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setTempTagFilter(prev => {
                                const newSet = new Set([
                                  ...prev,
                                  ...filteredProductTags
                                ]);

                                return Array.from(newSet);
                              });
                            }}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                          >
                            Select All
                          </button>

                          <button
                            onClick={() => {
                              setTempTagFilter(prev =>
                                prev.filter(tag =>
                                  !filteredProductTags.includes(tag)
                                )
                              );
                            }}
                            className="text-[10px] font-bold text-red-500 hover:text-red-700 cursor-pointer"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={productTagSearch}
                        onChange={(e) => setProductTagSearch(e.target.value)}
                        placeholder="Filter tags..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-400"
                      />

                      <div className="max-h-64 overflow-y-auto border border-slate-200 rounded bg-slate-50 p-2 space-y-4">
                        <div className="space-y-1">
                          <div className="space-y-1 pl-1">
                            {filteredProductTags.map(t => (
                              <label key={`product-${t}`} className="flex items-center gap-2 cursor-pointer py-1 group">
                                <input
                                  type="checkbox"
                                  checked={tempTagFilter.includes(t)}
                                  onChange={(e) => {
                                    if (e.target.checked) setTempTagFilter(prev => [...prev, t]);
                                    else setTempTagFilter(prev => prev.filter(x => x !== t));
                                  }}
                                  className="rounded text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-xs text-slate-700 group-hover:text-indigo-600 transition-colors">{t}</span>
                              </label>
                            ))}
                            {filteredProductTags.length === 0 && <div className="text-[10px] text-slate-400 italic pl-1">No matches</div>}
                          </div>
                        </div>
                        {filteredProductTags.length === 0 && (
                          <div className="text-xs text-slate-400 py-2 text-center">
                            No product tags found
                          </div>
                        )}
                      </div>

                      <div className="pt-1">
                        <label className="text-xs font-bold text-slate-600 mb-1 block">
                          Add Manual Tags (comma separated) (Support both Order tags and product tags)
                        </label>
                        <input
                          type="text"
                          value={tempTagInputSearch}
                          onChange={(e) => setTempTagInputSearch(e.target.value)}
                          placeholder="tag1, tag2..."
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => {
                            setTagSearch('');
                            setProductTagSearch('');
                            setTempTagFilter([]);
                            setTagFilter([]);
                            setTagInputSearch('');
                            setTempTagInputSearch('');
                            setPage(1);
                            setOpenFilter(null);
                          }}
                          className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition cursor-pointer"
                        >
                          Clear
                        </button>

                        <button
                          onClick={handleApplyTagSearch}
                          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </ThFilter>

                  <ThFilter col="amount" label="Amount" active={amountFrom || amountTo} dropdownWidth="w-64" handleSort={handleSort} sortCol={sortCol} sortDir={sortDir} setOpenFilter={setOpenFilter} openFilter={openFilter}>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-bold text-slate-600">From</label>
                        <input
                          type="number"
                          value={tempAmountFrom}
                          onChange={e => setTempAmountFrom(e.target.value)}
                          placeholder="0.00"
                          className="w-full mt-1 px-2 py-1.5 text-sm border border-slate-200 rounded bg-slate-50 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-600">To</label>
                        <input
                          type="number"
                          value={tempAmountTo}
                          onChange={e => setTempAmountTo(e.target.value)}
                          placeholder="9999"
                          className="w-full mt-1 px-2 py-1.5 text-sm border border-slate-200 rounded bg-slate-50 outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setTempAmountFrom('');
                            setTempAmountTo('');
                            setAmountFrom('');
                            setAmountTo('');
                            setPage(1);
                            setOpenFilter(null);
                          }}
                          className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition cursor-pointer"
                        >
                          Clear
                        </button>

                        <button
                          onClick={handleApplyAmount}
                          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </ThFilter>

                  <ThFilter col="payment" label="Payment" active={selectedPaymentStatus.length > 0} dropdownWidth="w-52" handleSort={handleSort} sortCol={sortCol} sortDir={sortDir} setOpenFilter={setOpenFilter} openFilter={openFilter}>
                    <div className="space-y-2">
                      {meta.payments.map(s => (
                        <label key={s} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={selectedPaymentStatus.includes(s)} onChange={e => {
                            if (e.target.checked) setSelectedPaymentStatus([...selectedPaymentStatus, s]);
                            else setSelectedPaymentStatus(selectedPaymentStatus.filter(x => x !== s));
                          }} className="rounded text-indigo-600 focus:ring-indigo-500" />
                          <span className="text-xs text-slate-700 capitalize">{s.replace('_', ' ')}</span>
                        </label>
                      ))}
                      {meta.payments.length === 0 && <div className="text-xs text-slate-400">No statuses found.</div>}
                      <button onClick={() => { setSelectedPaymentStatus([]); setOpenFilter(null); }} className="w-full mt-1 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded cursor-pointer">Clear</button>
                    </div>
                  </ThFilter>

                  <ThFilter col="fulfillment" label="Status" active={selectedFulfillmentStatus.length > 0} dropdownWidth="w-52" handleSort={handleSort} sortCol={sortCol} sortDir={sortDir} setOpenFilter={setOpenFilter} openFilter={openFilter}>
                    <div className="space-y-2">
                      {meta.fulfillments.map(s => (
                        <label key={s} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={selectedFulfillmentStatus.includes(s)} onChange={e => {
                            if (e.target.checked) setSelectedFulfillmentStatus([...selectedFulfillmentStatus, s]);
                            else setSelectedFulfillmentStatus(selectedFulfillmentStatus.filter(x => x !== s));
                          }} className="rounded text-indigo-600 focus:ring-indigo-500" />
                          <span className="text-xs text-slate-700 capitalize">{s}</span>
                        </label>
                      ))}
                      {meta.fulfillments.length === 0 && <div className="text-xs text-slate-400">No statuses found.</div>}
                      <button onClick={() => { setSelectedFulfillmentStatus([]); setOpenFilter(null); }} className="w-full mt-1 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded cursor-pointer">Clear</button>
                    </div>
                  </ThFilter>

                  <ThFilter
                    col="items"
                    label="Items (Variety)"
                    sortable={false}
                    active={selectedVarieties.length > 0 || !!freeTextVarieties}
                    dropdownWidth="w-80"
                    align="right"
                    handleSort={handleSort}
                    sortCol={sortCol}
                    sortDir={sortDir}
                    setOpenFilter={(value) => {
                      if (value === 'items') {
                        setTempSelectedVarieties(selectedVarieties);
                        setTempFreeTextVarieties(freeTextVarieties);
                        setTempVarietyFilterMode(varietyFilterMode);
                      }
                      setOpenFilter(value);
                    }}
                    openFilter={openFilter}
                  >
                    <div className="space-y-4">
                      {/* Filter mode toggle */}
                      <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mode:</span>
                        <button
                          onClick={() => setTempVarietyFilterMode('include')}
                          className={`flex-1 py-1 text-[10px] font-bold rounded transition cursor-pointer ${tempVarietyFilterMode === 'include' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}
                        >
                          Include
                        </button>
                        <button
                          onClick={() => setTempVarietyFilterMode('exclude')}
                          className={`flex-1 py-1 text-[10px] font-bold rounded transition cursor-pointer ${tempVarietyFilterMode === 'exclude' ? 'bg-red-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}
                        >
                          Exclude
                        </button>
                      </div>
                      {tempVarietyFilterMode === 'exclude' && (
                        <p className="text-[10px] text-red-600 font-medium bg-red-50 px-2 py-1 rounded">
                          Shows orders that do NOT contain selected varieties
                        </p>
                      )}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-bold text-slate-600">Checkbox List</label>
                          <div className="flex flex-wrap gap-2 justify-end">
                            <button
                              onClick={() => {
                                setTempSelectedVarieties([...meta.varieties]);
                              }}
                              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                            >
                              Select All
                            </button>
                            <button
                              onClick={() => {
                                setTempSelectedVarieties([]);
                              }}
                              className="text-[10px] font-bold text-red-400 hover:text-red-600 cursor-pointer"
                            >
                              Clear All
                            </button>
                          </div>
                        </div>

                        <input
                          type="text"
                          value={varietySearch}
                          onChange={(e) => setVarietySearch(e.target.value)}
                          placeholder="Filter products..."
                          className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white outline-none mb-2 focus:ring-2 focus:ring-indigo-400"
                        />

                        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded bg-slate-50 p-2 mt-1 space-y-3">
                          {Object.entries(groupedVarieties).map(([group, items]) => (
                            <div key={group} className="space-y-1">
                              {group !== 'Other' && (
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight bg-slate-100/50 px-1 rounded">
                                  {group}
                                </div>
                              )}
                              <div className="space-y-1.5 pl-1">
                                {items.map(v => (
                                  <label key={v} className="flex items-start gap-2 cursor-pointer group">
                                    <input
                                      type="checkbox"
                                      checked={tempSelectedVarieties.includes(v)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setTempSelectedVarieties(prev => [...prev, v]);
                                        } else {
                                          setTempSelectedVarieties(prev => prev.filter(sv => sv !== v));
                                        }
                                      }}
                                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-xs text-slate-700 leading-tight group-hover:text-indigo-600 transition-colors">{v}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                          {filteredVarieties.length === 0 && <div className="text-xs text-slate-400 text-center py-4">No items found.</div>}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-600">
                          Or Paste List (Excel)
                        </label>

                        <textarea
                          value={tempFreeTextVarieties}
                          onChange={e =>
                            setTempFreeTextVarieties(e.target.value)
                          }
                          placeholder="Carolina Reaper&#10;Trinidad Scorpion"
                          rows={3}
                          className="w-full mt-1 px-2 py-1.5 text-xs border border-slate-200 rounded bg-slate-50 outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedVarieties([]);
                            setTempSelectedVarieties([]);
                            setTempFreeTextVarieties('');
                            setFreeTextVarieties('');
                            setVarietyFilterMode('include');
                            setTempVarietyFilterMode('include');
                            setPage(1);
                            setOpenFilter(null);
                          }}
                          className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition cursor-pointer"
                        >
                          Clear
                        </button>

                        <button
                          onClick={() => {
                            setSelectedVarieties(tempSelectedVarieties);
                            setFreeTextVarieties(tempFreeTextVarieties);
                            setVarietyFilterMode(tempVarietyFilterMode);
                            setPage(1);
                            setOpenFilter(null);
                          }}
                          className={`flex-1 py-2 text-white text-xs font-bold rounded-lg transition cursor-pointer ${tempVarietyFilterMode === 'exclude' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </ThFilter>

                  <ThFilter
                    col="shipping"
                    label="Shipping"
                    sortable={false}
                    active={selectedShipping.length > 0}
                    dropdownWidth="w-72"
                    align="right"
                    handleSort={handleSort}
                    sortCol={sortCol}
                    sortDir={sortDir}
                    setOpenFilter={(value) => {
                      if (value === 'shipping') {
                        setTempSelectedShipping(selectedShipping);
                      }
                      setOpenFilter(value);
                    }}
                    openFilter={openFilter}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-slate-600">Checkbox List</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setTempSelectedShipping(prev => {
                                const newSet = new Set([...prev, ...filteredShipping]);
                                return Array.from(newSet);
                              });
                            }}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                          >
                            Select Visible
                          </button>
                          <button
                            onClick={() => {
                              setTempSelectedShipping(prev => prev.filter(s => !filteredShipping.includes(s)));
                            }}
                            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            Clear Visible
                          </button>
                          {/* <button
                            onClick={() => {
                              setTempSelectedShipping([]);
                            }}
                            className="text-[10px] font-bold text-red-400 hover:text-red-600"
                          >
                            Clear All
                          </button> */}
                        </div>
                      </div>

                      <input
                        type="text"
                        value={shippingSearch}
                        onChange={(e) => setShippingSearch(e.target.value)}
                        placeholder="Filter methods..."
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white outline-none mb-2 focus:ring-2 focus:ring-indigo-400"
                      />

                      <div className="max-h-52 overflow-y-auto border border-slate-200 rounded bg-slate-50 p-2 space-y-1.5">
                        {filteredShipping.map(s => (
                          <label key={s} className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={tempSelectedShipping.includes(s)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setTempSelectedShipping(prev => [...prev, s]);
                                } else {
                                  setTempSelectedShipping(prev => prev.filter(x => x !== s));
                                }
                              }}
                              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-xs text-slate-700 leading-tight">
                              {s}
                            </span>
                          </label>
                        ))}
                        {filteredShipping.length === 0 && (
                          <div className="text-xs text-slate-400 text-center py-2">
                            No shipping methods found
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setTempSelectedShipping([]);
                            setSelectedShipping([]);
                            setPage(1);
                            setOpenFilter(null);
                          }}
                          className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition cursor-pointer"
                        >
                          Clear
                        </button>

                        <button
                          onClick={() => {
                            setSelectedShipping(tempSelectedShipping);
                            setPage(1);
                            setOpenFilter(null);
                          }}
                          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </ThFilter>

                  <th className="px-4 py-3"><span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="10" className="p-0">
                      <div className="divide-y divide-slate-100">
                        {[...Array(8)].map((_, i) => (
                          <div
                            key={i}
                            className="grid grid-cols-10 gap-4 px-4 py-4 animate-pulse"
                          >
                            <div className="h-4 bg-slate-200 rounded col-span-1"></div>
                            <div className="h-4 bg-slate-200 rounded col-span-2"></div>
                            <div className="h-4 bg-slate-200 rounded col-span-1"></div>
                            <div className="h-4 bg-slate-200 rounded col-span-2"></div>
                            <div className="h-4 bg-slate-200 rounded col-span-1"></div>
                            <div className="h-4 bg-slate-200 rounded col-span-1"></div>
                            <div className="h-4 bg-slate-200 rounded col-span-1"></div>
                            <div className="h-4 bg-slate-200 rounded col-span-1"></div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : pageSlice.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-16 text-center text-slate-400">
                      <span className="text-3xl block mb-2">📭</span>
                      <p className="text-sm font-medium">No orders match these filters.</p>
                    </td>
                  </tr>
                ) : (
                  pageSlice.map(o => {
                    const dt = new Date(o.created_at);
                    return (
                      <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3.5">
                          <input
                            type="checkbox"
                            checked={selectedOrders.includes(o.id)}
                            onChange={(e) =>
                              handleSelectOrder(
                                o.id,
                                e.target.checked
                              )
                            }
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap"><span className="text-sm font-bold text-indigo-600">#{o.order_number}</span></td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-800 text-sm">{o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : 'Guest'}</div>
                          <div className="text-xs text-slate-400">{o.customer?.email || '—'}</div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="text-sm text-slate-700 font-medium">{dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                          <div className="text-xs text-slate-400">{dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td className="px-4 py-3.5 min-w-[180px] max-w-[180px]">
                          <div className="flex flex-wrap gap-1 overflow-hidden">
                            {o.tags ? (
                              o.tags.split(',').map((t) => (
                                <span
                                  key={t}
                                  className="inline-flex max-w-full items-center bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded truncate"
                                >
                                  {t.trim()}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-sm font-semibold text-slate-800">
                          {new Intl.NumberFormat('en-GB', {
                            style: 'currency',
                            currency: o.currency || 'GBP',
                          }).format(Number(o.total_price || 0))}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <StatusBadge
                            type="payment"
                            status={o.financial_status}
                          />
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <StatusBadge
                            type="fulfillment"
                            status={o.fulfillment_status}
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="space-y-0.5">
                            {(o.line_items || []).map((li, idx) => (
                              <div key={idx} className="text-xs text-slate-600 leading-tight">
                                <span className="font-bold text-slate-800">{li.quantity}x</span> {li.title}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {(o.shipping_lines || []).map((s, idx) => (
                            <div key={idx} className="text-xs text-slate-600 font-medium">{s.title}</div>
                          ))}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {(!o.fulfillment_status || o.fulfillment_status === 'unfulfilled') ? (
                            <button
                              onClick={() => handleBulkFulfill([o.id])}
                              disabled={fulfilling}
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded transition cursor-pointer"
                            >
                              Mark Fulfilled
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">Done</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {filtered.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={pagination.total}
            limit={limit}
            onLimit={l => { setLimit(l); setPage(1); }}
            start={pageStart}
            end={pageEnd}
            onPage={setPage}
          />
        )}
      </div>
      {/* ── Royal Mail Automation Panel ─────────────────────────────────────── */}
      {rmPanel && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-red-50">
              <div>
                <h2 className="text-base font-bold text-slate-800">📮 Royal Mail — Automated Fulfilment</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {getShipOrderIds().length} order{getShipOrderIds().length !== 1 ? 's' : ''} selected
                  {selectedOrders.length === 0 ? ' (all filtered)' : ''}
                </p>
              </div>
              <button
                onClick={() => { setRmPanel(false); setRmStep('idle'); }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-100 text-slate-500 text-lg transition cursor-pointer"
              >✕</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Step 1: Despatch date */}
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-xs font-bold text-slate-600 block mb-1">Planned Despatch Date</label>
                  <input
                    type="date"
                    value={rmDespatchDate}
                    onChange={e => setRmDespatchDate(e.target.value)}
                    disabled={rmStep !== 'idle'}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-400 outline-none disabled:opacity-50"
                  />
                </div>
                {rmStep === 'idle' && (
                  <button
                    onClick={rmCreateShipments}
                    className="mt-5 px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition cursor-pointer whitespace-nowrap"
                  >
                    Create Shipments →
                  </button>
                )}
              </div>

              {/* Step 2: Creating spinner */}
              {rmStep === 'creating' && (
                <div className="flex items-center gap-3 py-4">
                  <div className="w-5 h-5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                  <span className="text-sm text-slate-600 font-medium">Creating shipments in Royal Mail Click &amp; Drop…</span>
                </div>
              )}

              {/* Error */}
              {rmError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 font-medium">
                  {rmError}
                </div>
              )}

              {/* Step 3+: Results table */}
              {rmResults.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Shipment Results
                  </p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold text-slate-500">Order</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-500">Tracking #</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rmResults.map((r, i) => (
                          <tr key={i} className={r.error ? 'bg-red-50' : ''}>
                            <td className="px-3 py-2 font-semibold text-indigo-600">#{r.orderNumber}</td>
                            <td className="px-3 py-2 font-mono text-slate-700">{r.trackingNumber || '—'}</td>
                            <td className="px-3 py-2">
                              {r.error
                                ? <span className="text-red-600 font-medium">Failed: {r.error}</span>
                                : <span className="text-emerald-600 font-bold">✓ {r.status}</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Step 3: Download labels + manifest buttons */}
              {(rmStep === 'labelling' || rmStep === 'done') && rmIdentifiers.length > 0 && (
                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    onClick={rmDownloadLabels}
                    disabled={rmStep === 'labelling' && rmResults.length === 0}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition cursor-pointer"
                  >
                    {rmStep === 'labelling' && rmResults.length > 0 ? '⬇ Download Labels PDF' : '⬇ Download Labels PDF'}
                  </button>
                  <button
                    onClick={rmCreateManifest}
                    disabled={rmStep === 'manifesting'}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition cursor-pointer"
                  >
                    {rmStep === 'manifesting' ? 'Creating manifest…' : '📋 Create & Download Manifest'}
                  </button>
                </div>
              )}

              {rmStep === 'manifesting' && (
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                  <span className="text-sm text-slate-600">Creating manifest…</span>
                </div>
              )}

              {rmStep === 'done' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700 font-medium">
                  All done! Labels downloaded. Don't forget to hand over to Royal Mail and scan the manifest.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-400">
                Requires <span className="font-mono font-bold">ROYAL_MAIL_OBA_TOKEN</span> in backend .env
              </p>
              <button
                onClick={() => { setRmPanel(false); setRmStep('idle'); }}
                className="px-4 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Email Notification Results Panel ─────────────────────────────────── */}
      {notifyPanel && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-teal-50">
              <div>
                <h2 className="text-base font-bold text-slate-800">📧 Customer Notifications Sent</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {notifyResults.filter(r => r.success).length} sent ·{' '}
                  {notifyResults.filter(r => !r.success).length} failed
                </p>
              </div>
              <button
                onClick={() => setNotifyPanel(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-teal-100 text-slate-500 text-lg transition cursor-pointer"
              >✕</button>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-slate-500">Order</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-500">Sent To</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-500">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {notifyResults.map((r, i) => (
                    <tr key={i} className={r.success ? '' : 'bg-red-50'}>
                      <td className="px-3 py-2 font-semibold text-indigo-600">#{r.orderNumber}</td>
                      <td className="px-3 py-2 text-slate-600">{r.toEmail || '—'}</td>
                      <td className="px-3 py-2">
                        {r.success
                          ? <span className="text-emerald-600 font-bold">✓ Sent</span>
                          : <span className="text-red-600 font-medium">{r.error}</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end px-6 py-3 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => setNotifyPanel(false)}
                className="px-4 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DPD Automation Panel ──────────────────────────────────────────────── */}
      {dpdPanel && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-orange-50">
              <div>
                <h2 className="text-base font-bold text-slate-800">📦 DPD — Automated Fulfilment</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {getShipOrderIds().length} order{getShipOrderIds().length !== 1 ? 's' : ''} selected
                  {selectedOrders.length === 0 ? ' (all filtered)' : ''}
                  {' · '}
                  {getShipOrderIds().filter(id => {
                    const o = filtered.find(o => o.id === id);
                    return o && (o.tags || '').toLowerCase().includes('dpd-parcel');
                  }).length} Parcel &amp; {getShipOrderIds().filter(id => {
                    const o = filtered.find(o => o.id === id);
                    return o && (o.tags || '').toLowerCase().includes('dpd-expresspack');
                  }).length} Express Pack
                </p>
              </div>
              <button
                onClick={() => { setDpdPanel(false); setDpdStep('idle'); }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-orange-100 text-slate-500 text-lg transition cursor-pointer"
              >✕</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Despatch date + create button */}
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-xs font-bold text-slate-600 block mb-1">Planned Despatch Date</label>
                  <input
                    type="date"
                    value={dpdDespatchDate}
                    onChange={e => setDpdDespatchDate(e.target.value)}
                    disabled={dpdStep !== 'idle'}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none disabled:opacity-50"
                  />
                </div>
                {dpdStep === 'idle' && (
                  <button
                    onClick={dpdCreateShipments}
                    className="mt-5 px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition cursor-pointer whitespace-nowrap"
                  >
                    Create Shipments →
                  </button>
                )}
              </div>

              {dpdStep === 'creating' && (
                <div className="flex items-center gap-3 py-4">
                  <div className="w-5 h-5 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin" />
                  <span className="text-sm text-slate-600 font-medium">Creating shipments in DPD Local…</span>
                </div>
              )}

              {dpdError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 font-medium">
                  {dpdError}
                </div>
              )}

              {dpdResults.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Shipment Results</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold text-slate-500">Order</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-500">Consignment #</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-500">Service</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dpdResults.map((r, i) => (
                          <tr key={i} className={r.error ? 'bg-red-50' : ''}>
                            <td className="px-3 py-2 font-semibold text-indigo-600">#{r.orderNumber}</td>
                            <td className="px-3 py-2 font-mono text-slate-700">{r.consignmentNumber || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{r.service || '—'}</td>
                            <td className="px-3 py-2">
                              {r.error
                                ? <span className="text-red-600 font-medium">Failed: {r.error}</span>
                                : <span className="text-emerald-600 font-bold">✓ {r.status}</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(dpdStep === 'labelling' || dpdStep === 'done') && dpdConsignments.length > 0 && (
                <div className="pt-1">
                  <button
                    onClick={dpdDownloadLabels}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition cursor-pointer"
                  >
                    ⬇ Download DPD Labels PDF
                  </button>
                </div>
              )}

              {dpdStep === 'done' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700 font-medium">
                  Labels downloaded. Go to DPD Local → Shipment Review to print &amp; manifest.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-400">
                Requires <span className="font-mono font-bold">DPD_USERNAME</span> + <span className="font-mono font-bold">DPD_PASSWORD</span> in backend .env
              </p>
              <button
                onClick={() => { setDpdPanel(false); setDpdStep('idle'); }}
                className="px-4 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal.open && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">

            <div className="px-6 py-5 border-b border-slate-100">
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl
            ${confirmModal.type === 'success'
                      ? 'bg-emerald-100 text-emerald-600'
                      : 'bg-amber-100 text-amber-600'
                    }`}
                >
                  {confirmModal.type === 'success' ? '✓' : '!'}
                </div>

                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-800">
                    {confirmModal.title}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500 leading-relaxed">
                    {confirmModal.message}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50">
              <button
                onClick={() =>
                  setConfirmModal(prev => ({
                    ...prev,
                    open: false
                  }))
                }
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                onClick={() => confirmModal.onConfirm()}
                className={`px-4 py-2 rounded-xl text-white text-sm font-semibold transition cursor-pointer
          ${confirmModal.type === 'success'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
}

// ── CUSTOM HEADER DROPDOWN COMPONENT ──────────────────────────────────────
const ThFilter = React.memo(({
  col,
  label,
  active,
  sortable = true,
  dropdownWidth = 'w-52',
  align = 'left',
  children,
  handleSort,
  sortCol,
  sortDir,
  setOpenFilter,
  openFilter
}) => {

  const isActiveSort = sortable && sortCol === col;
  const isOpen = openFilter === col;

  const [dropdownStyle, setDropdownStyle] = React.useState({});
  const buttonRef = React.useRef(null);

  const updateDropdownPosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = dropdownWidth.includes('w-') ? parseInt(dropdownWidth.replace('w-', '')) * 4 : 208;

    let left = rect.left;
    if (align === 'right') {
      left = rect.right - width;
    }

    if (left + width > window.innerWidth - 16) {
      left = window.innerWidth - width - 16;
    }
    if (left < 16) left = 16;

    const spaceBelow = window.innerHeight - (rect.bottom + 8) - 16;

    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 8,
      left: left,
      maxHeight: `${spaceBelow}px`,
      zIndex: 2000,
      display: 'flex',
      flexDirection: 'column'
    });
  };

  const handleToggle = (e) => {
    e.stopPropagation();

    if (isOpen) {
      setOpenFilter(null);
      return;
    }

    updateDropdownPosition();

    setOpenFilter(col);
  };

  React.useEffect(() => {

    if (!isOpen) return;

    updateDropdownPosition();

    window.addEventListener('scroll', updateDropdownPosition, true);

    window.addEventListener('resize', updateDropdownPosition);

    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true);

      window.removeEventListener('resize', updateDropdownPosition);
    };

  }, [isOpen]);

  return (
    <th className="px-4 py-3">

      <div className="flex items-center gap-1.5 select-none">

        {sortable ? (
          <button
            onClick={() => handleSort(col)}
            className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-800 transition cursor-pointer"
          >
            {label}

            <svg
              className={`w-3.5 h-3.5 flex-shrink-0 ${isActiveSort ? 'text-indigo-600' : 'text-slate-400'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isActiveSort && sortDir === 'desc'
                ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M19 9l-7 7-7-7"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={isActiveSort ? 2.5 : 2}
                    d={isActiveSort
                      ? "M5 15l7-7 7 7"
                      : "M8 9l4-4 4 4M8 15l4 4 4-4"}
                  />
                )}
            </svg>
          </button>
        ) : (
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {label}
          </span>
        )}

        <button
          ref={buttonRef}
          onClick={handleToggle}
          className={`flex items-center justify-center w-5 h-5 rounded-md transition cursor-pointer ${active ? 'bg-indigo-100' : 'hover:bg-slate-100'
            }`}
        >
          <svg
            className={`w-3 h-3 flex-shrink-0 ${active ? 'text-indigo-600' : 'text-slate-400'
              }`}
            fill={active ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
            />
          </svg>
        </button>

        {isOpen && createPortal(
          <div
            style={dropdownStyle}
            className={`bg-white border border-slate-200 rounded-xl shadow-2xl ${dropdownWidth} overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 overflow-y-auto">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Filter by {label}
              </p>

              {children}
            </div>
          </div>,
          document.body
        )}

      </div>
    </th>
  );
});

// ── Pagination Component ──────────────────────────────────────────────────────
function Pagination({ page, totalPages, total, limit, onLimit, start, end, onPage }) {
  const nums = (() => {
    const range = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || i === page) {
        range.push(i);
      }
    }
    const res = [];
    let prev;
    for (let i of range) {
      if (prev !== undefined) {
        if (i - prev === 2) res.push(prev + 1);
        else if (i - prev > 2) res.push('...');
      }
      res.push(i);
      prev = i;
    }
    return res;
  })();

  const btnBase = 'inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-all border cursor-pointer';

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50/50">
      <div className="flex items-center gap-4">
        <p className="text-sm text-slate-500">
          Showing <span className="font-semibold text-slate-700">{total === 0 ? 0 : start + 1}–{end}</span> of{' '}
          <span className="font-semibold text-slate-700">{total}</span> orders
        </p>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Show:</span>
          <select
            value={limit}
            onChange={e => onLimit(Number(e.target.value))}
            className="bg-white border border-slate-200 text-slate-700 text-[11px] font-bold rounded-lg px-2 py-1 focus:ring-2 focus:ring-indigo-400 outline-none transition cursor-pointer"
          >
            {[10, 25, 50, 100, 250, 500, 10000].map(v => (
              <option key={v} value={v}>{v === 10000 ? '10k' : v}</option>
            ))}
          </select>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPage(page - 1)} disabled={page === 1}
            className={`${btnBase} bg-white border-slate-200 text-slate-600 hover:bg-slate-50 ${page === 1 ? 'opacity-40 cursor-not-allowed' : ''}`}
          >‹ Prev</button>
          {nums.map((n, i) => n === '...'
            ? <span key={`dots-${i}`} className="px-1 text-slate-400 text-sm">…</span>
            : <button key={n} onClick={() => onPage(n)}
              className={`${btnBase} ${n === page ? 'bg-indigo-600 border-indigo-600 text-white font-bold shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600'}`}
            >{n}</button>
          )}
          <button
            onClick={() => onPage(page + 1)} disabled={page === totalPages}
            className={`${btnBase} bg-white border-slate-200 text-slate-600 hover:bg-slate-50 ${page === totalPages ? 'opacity-40 cursor-not-allowed' : ''}`}
          >Next ›</button>
        </div>
      )}
      <Toaster position="top-right" />
    </div>
  );
}
