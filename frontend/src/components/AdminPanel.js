import React, { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

// ==========================================
// ألوان وتنسيقات مشتركة
// ==========================================
const COLORS = {
  primary: '#1F4E78',
  success: '#27ae60',
  warning: '#f39c12',
  danger: '#e74c3c',
  info: '#3498db',
  light: '#f8f9fa',
  border: '#dee2e6'
};

const Card = ({ title, children, style = {} }) => (
  <div style={{
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: '20px',
    marginBottom: '20px',
    ...style
  }}>
    {title && <h3 style={{ margin: '0 0 15px 0', color: COLORS.primary, fontSize: '18px' }}>{title}</h3>}
    {children}
  </div>
);

const Button = ({ onClick, children, variant = 'primary', disabled = false, style = {} }) => {
  const variants = {
    primary: { bg: COLORS.primary, color: 'white' },
    success: { bg: COLORS.success, color: 'white' },
    danger: { bg: COLORS.danger, color: 'white' },
    outline: { bg: 'white', color: COLORS.primary, border: `1px solid ${COLORS.primary}` }
  };
  const v = variants[variant] || variants.primary;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 20px',
        background: disabled ? '#bdc3c7' : v.bg,
        color: v.color,
        border: v.border || 'none',
        borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 'bold',
        fontSize: '14px',
        transition: 'all 0.2s',
        ...style
      }}
    >
      {children}
    </button>
  );
};

// ==========================================
// مكون رفع الملفات (Drag & Drop)
// ==========================================
const FileUploader = ({ onUpload, accept = '.xlsx,.xls', label, icon, templateUrl }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
      setFile(droppedFile);
      setError(null);
    } else {
      setError('يجب رفع ملف Excel فقط (.xlsx)');
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE_URL}${onUpload}`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'فشل في الاستيراد');
      }

      setResult(data);
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ direction: 'rtl' }}>
      {/* منطقة السحب والإفلات */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragging ? COLORS.primary : COLORS.border}`,
          borderRadius: '8px',
          padding: '40px 20px',
          textAlign: 'center',
          background: isDragging ? '#e8f4f8' : COLORS.light,
          transition: 'all 0.2s',
          cursor: 'pointer'
        }}
        onClick={() => document.getElementById(`file-input-${label}`).click()}
      >
        <div style={{ fontSize: '48px', marginBottom: '10px' }}>{icon}</div>
        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#2c3e50' }}>
          {isDragging ? 'أفلت الملف هنا' : 'اسحب ملف Excel هنا أو انقر للاختيار'}
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: '#7f8c8d' }}>
          الملفات المدعومة: .xlsx, .xls
        </p>
        <input
          id={`file-input-${label}`}
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </div>

      {/* عرض الملف المختار */}
      {file && (
        <div style={{
          marginTop: '15px',
          padding: '12px',
          background: '#e8f4f8',
          borderRadius: '6px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <span style={{ fontWeight: 'bold' }}>📄 {file.name}</span>
            <span style={{ color: '#7f8c8d', marginRight: '10px', fontSize: '12px' }}>
              ({(file.size / 1024).toFixed(1)} KB)
            </span>
          </div>
          <Button
            onClick={handleUpload}
            disabled={uploading}
            variant="success"
            style={{ padding: '6px 16px', fontSize: '12px' }}
          >
            {uploading ? '⏳ جاري الاستيراد...' : '🚀 استيراد'}
          </Button>
        </div>
      )}

      {/* نتيجة الاستيراد */}
      {result && (
        <div style={{
          marginTop: '15px',
          padding: '15px',
          background: '#d4edda',
          borderRadius: '6px',
          border: '1px solid #c3e6cb'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#155724' }}>✅ {result.message}</h4>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {result.created !== undefined && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: COLORS.success }}>{result.created}</div>
                <div style={{ fontSize: '12px', color: '#155724' }}>مُنشأ جديد</div>
              </div>
            )}
            {result.updated !== undefined && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: COLORS.info }}>{result.updated}</div>
                <div style={{ fontSize: '12px', color: '#155724' }}>مُحدّث</div>
              </div>
            )}
            {result.imported !== undefined && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: COLORS.success }}>{result.imported}</div>
                <div style={{ fontSize: '12px', color: '#155724' }}>مُستورد</div>
              </div>
            )}
            {result.total_processed && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: COLORS.primary }}>{result.total_processed}</div>
                <div style={{ fontSize: '12px', color: '#155724' }}>إجمالي المعالج</div>
              </div>
            )}
          </div>
          {result.errors && result.errors.length > 0 && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#856404' }}>
              ⚠️ {result.errors.length} أخطاء (تفحص Console للتفاصيل)
            </div>
          )}
        </div>
      )}

      {/* خطأ */}
      {error && (
        <div style={{
          marginTop: '15px',
          padding: '12px',
          background: '#f8d7da',
          color: '#721c24',
          borderRadius: '6px',
          fontWeight: 'bold'
        }}>
          ❌ {error}
        </div>
      )}

      {/* رابط التحميل */}
      {templateUrl && (
        <div style={{ marginTop: '10px', textAlign: 'center' }}>
          <a
            href={templateUrl}
            download
            style={{
              color: COLORS.info,
              textDecoration: 'none',
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            📥 تحميل قالب Excel
          </a>
        </div>
      )}
    </div>
  );
};

// ==========================================
// مكون إدارة الأسعار (Price Manager)
// ==========================================
const PriceManager = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [message, setMessage] = useState(null);

  const fetchDictionary = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/boq-dictionary`);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (err) {
      console.error('Failed to fetch dictionary:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDictionary();
  }, [fetchDictionary]);

  const handleEdit = (item) => {
    setEditingId(item.boq_code);
    setEditForm({ ...item });
  };

  const handleSave = async (boqCode) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/boq-dictionary/${boqCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_price: parseFloat(editForm.unit_price),
          description_ar: editForm.description_ar,
          description_en: editForm.description_en,
          category: editForm.category,
          unit: editForm.unit,
          default_qty: parseFloat(editForm.default_qty)
        })
      });

      if (res.ok) {
        setMessage({ type: 'success', text: `تم تحديث البند ${boqCode} بنجاح` });
        fetchDictionary();
        setEditingId(null);
      } else {
        throw new Error('فشل التحديث');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleDeactivate = async (boqCode) => {
    if (!window.confirm(`هل أنت متأكد من إلغاء تفعيل البند ${boqCode}؟`)) return;

    try {
      const res = await fetch(`${API_BASE_URL}/admin/boq-dictionary/${boqCode}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setMessage({ type: 'success', text: `تم إلغاء تفعيل البند ${boqCode}` });
        fetchDictionary();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '40px' }}>⏳ جاري تحميل القاموس...</div>;

  return (
    <div style={{ direction: 'rtl' }}>
      {message && (
        <div style={{
          padding: '12px',
          marginBottom: '15px',
          background: message.type === 'success' ? '#d4edda' : '#f8d7da',
          color: message.type === 'success' ? '#155724' : '#721c24',
          borderRadius: '6px',
          fontWeight: 'bold'
        }}>
          {message.type === 'success' ? '✅' : '❌'} {message.text}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '8px', overflow: 'hidden' }}>
          <thead style={{ background: COLORS.primary, color: 'white' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'right' }}>الكود</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الفئة</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الوصف العربي</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الوحدة</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>الكمية</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>السعر ($)</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#7f8c8d' }}>
                  📭 القاموس فارغ. ارفع ملف Excel أو أضف بنود يدوياً.
                </td>
              </tr>
            ) : (
              items.map(item => (
                <tr key={item.boq_code} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: COLORS.primary }}>{item.boq_code}</td>
                  <td style={{ padding: '12px' }}>{item.category}</td>
                  <td style={{ padding: '12px' }}>
                    {editingId === item.boq_code ? (
                      <input
                        value={editForm.description_ar || ''}
                        onChange={e => setEditForm({...editForm, description_ar: e.target.value})}
                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
                      />
                    ) : (
                      item.description_ar
                    )}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {editingId === item.boq_code ? (
                      <input
                        value={editForm.unit || ''}
                        onChange={e => setEditForm({...editForm, unit: e.target.value})}
                        style={{ width: '60px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', textAlign: 'center' }}
                      />
                    ) : (
                      item.unit
                    )}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {editingId === item.boq_code ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.default_qty || 0}
                        onChange={e => setEditForm({...editForm, default_qty: e.target.value})}
                        style={{ width: '70px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', textAlign: 'center' }}
                      />
                    ) : (
                      item.default_qty
                    )}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {editingId === item.boq_code ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.unit_price || 0}
                        onChange={e => setEditForm({...editForm, unit_price: e.target.value})}
                        style={{
                          width: '80px',
                          padding: '6px',
                          borderRadius: '4px',
                          border: '2px solid #27ae60',
                          textAlign: 'center',
                          fontWeight: 'bold',
                          color: '#27ae60'
                        }}
                      />
                    ) : (
                      <span style={{ fontWeight: 'bold', color: '#27ae60' }}>${item.unit_price?.toFixed(2)}</span>
                    )}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {editingId === item.boq_code ? (
                      <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                        <Button
                          onClick={() => handleSave(item.boq_code)}
                          disabled={saving}
                          variant="success"
                          style={{ padding: '4px 12px', fontSize: '12px' }}
                        >
                          💾 حفظ
                        </Button>
                        <Button
                          onClick={() => setEditingId(null)}
                          variant="outline"
                          style={{ padding: '4px 12px', fontSize: '12px' }}
                        >
                          إلغاء
                        </Button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                        <button
                          onClick={() => handleEdit(item)}
                          style={{
                            padding: '4px 12px',
                            background: COLORS.info,
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          ✏️ تعديل
                        </button>
                        <button
                          onClick={() => handleDeactivate(item.boq_code)}
                          style={{
                            padding: '4px 12px',
                            background: COLORS.danger,
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          🗑️ حذف
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==========================================
// الصفحة الرئيسية للوحة التحكم
// ==========================================
const AdminPanel = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState('beneficiaries');

  const tabs = [
    { id: 'beneficiaries', label: '👥 استيراد المستفيدين', icon: '👥' },
    { id: 'dictionary', label: '📋 استيراد القاموس', icon: '📋' },
    { id: 'prices', label: '💰 إدارة الأسعار', icon: '💰' }
  ];

  return (
    <div style={{ direction: 'rtl', maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '30px',
        flexWrap: 'wrap',
        gap: '15px'
      }}>
        <div>
          <h1 style={{ margin: '0 0 5px 0', color: COLORS.primary, fontSize: '28px' }}>
            ⚙️ لوحة تحكم الإدارة
          </h1>
          <p style={{ margin: 0, color: '#7f8c8d', fontSize: '14px' }}>
            إدارة المشاريع والأسعار واستيراد البيانات
          </p>
        </div>
        <Button onClick={onBack} variant="outline">
          ← العودة للتطبيق
        </Button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '5px',
        marginBottom: '25px',
        borderBottom: `2px solid ${COLORS.border}`,
        paddingBottom: '2px'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 24px',
              background: activeTab === tab.id ? COLORS.primary : 'transparent',
              color: activeTab === tab.id ? 'white' : '#2c3e50',
              border: 'none',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
              transition: 'all 0.2s',
              position: 'relative',
              top: '2px'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'beneficiaries' && (
        <Card title="📥 استيراد بيانات المستفيدين من Excel">
          <p style={{ color: '#7f8c8d', marginBottom: '20px', lineHeight: '1.6' }}>
            ارفع ملف Excel يحتوي على بيانات المستفيدين. سيتم إنشاء حمامات جديدة أو تحديث الموجودة تلقائياً.
            <br />
            <strong>الأعمدة المطلوبة:</strong> رقم الحمام | اسم المستفيد | المربع | المهندس | GPS
          </p>
          <FileUploader
            onUpload="/admin/import-beneficiaries"
            label="beneficiaries"
            icon="👥"
            templateUrl="/templates/import_beneficiaries_template.xlsx"
          />
        </Card>
      )}

      {activeTab === 'dictionary' && (
        <Card title="📥 استيراد قاموس البنود والأسعار">
          <p style={{ color: '#7f8c8d', marginBottom: '20px', lineHeight: '1.6' }}>
            ارفع ملف Excel يحتوي على قائمة البنود وأسعار الوحدات. هذا القاموس سيُستخدم في حساب نسب الإنجاز المالية.
            <br />
            <strong>الأعمدة المطلوبة:</strong> كود البند | الفئة | الوصف | الوحدة | الكمية | السعر
          </p>
          <FileUploader
            onUpload="/admin/import-boq-dictionary"
            label="dictionary"
            icon="📋"
            templateUrl="/templates/import_boq_dictionary_template.xlsx"
          />
        </Card>
      )}

      {activeTab === 'prices' && (
        <Card title="💰 إدارة أسعار البنود (القاموس الديناميكي)">
          <p style={{ color: '#7f8c8d', marginBottom: '20px', lineHeight: '1.6' }}>
            تعديل الأسعار والأوصاف مباشرة. أي تغيير هنا سيؤثر فوراً على حسابات الإنجاز المالي للمشروع.
          </p>
          <PriceManager />
        </Card>
      )}
    </div>
  );
};

export default AdminPanel;
