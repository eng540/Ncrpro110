// AdminUsers.js – إدارة المستخدمين والأدوار (RBAC)
// يعتمد على authFetch لإضافة التوكن تلقائياً

import React, { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    role_id: '',
    is_active: true
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  // جلب المستخدمين والأدوار
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/users`),
        fetch(`${API_BASE_URL}/admin/roles`)
      ]);
      if (!usersRes.ok) throw new Error('فشل جلب المستخدمين');
      if (!rolesRes.ok) throw new Error('فشل جلب الأدوار');
      const usersData = await usersRes.json();
      const rolesData = await rolesRes.json();
      setUsers(usersData);
      setRoles(rolesData);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAddModal = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      email: '',
      full_name: '',
      password: '',
      role_id: roles[0]?.id || '',
      is_active: true
    });
    setShowModal(true);
    setMessage(null);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email || '',
      full_name: user.full_name || '',
      password: '', // لا نعرض كلمة السر
      role_id: user.role_id,
      is_active: user.is_active
    });
    setShowModal(true);
    setMessage(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      let url, method, body;
      if (editingUser) {
        url = `/admin/users/${editingUser.id}`;
        method = 'PATCH';
        const payload = {};
        if (formData.username !== editingUser.username) payload.username = formData.username;
        if (formData.email !== editingUser.email) payload.email = formData.email;
        if (formData.full_name !== editingUser.full_name) payload.full_name = formData.full_name;
        if (formData.password) payload.password = formData.password;
        if (formData.role_id !== editingUser.role_id) payload.role_id = formData.role_id;
        if (formData.is_active !== editingUser.is_active) payload.is_active = formData.is_active;
        body = JSON.stringify(payload);
        if (Object.keys(payload).length === 0) {
          setMessage({ type: 'warning', text: 'لم يتم تغيير أي بيانات' });
          setSubmitting(false);
          return;
        }
      } else {
        url = '/admin/users';
        method = 'POST';
        body = JSON.stringify({
          username: formData.username,
          email: formData.email || null,
          full_name: formData.full_name || null,
          password: formData.password,
          role_id: parseInt(formData.role_id),
          is_active: formData.is_active
        });
      }
      const res = await fetch(`${API_BASE_URL}${url}`, { method, body, headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'فشل العملية');
      }
      setMessage({ type: 'success', text: editingUser ? 'تم تحديث المستخدم بنجاح' : 'تم إضافة المستخدم بنجاح' });
      setShowModal(false);
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user) => {
    if (user.username === 'admin') {
      setMessage({ type: 'error', text: 'لا يمكن حذف المستخدم admin الرئيسي' });
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف المستخدم "${user.username}"؟`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${user.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('فشل الحذف');
      setMessage({ type: 'success', text: 'تم حذف المستخدم بنجاح' });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const getRoleName = (roleId) => {
    const role = roles.find(r => r.id === roleId);
    return role ? role.name : 'غير معروف';
  };

  const getRoleBadgeColor = (roleName) => {
    if (roleName === 'admin') return '#c0392b';
    if (roleName === 'engineer') return '#2980b9';
    return '#27ae60';
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '40px' }}>⏳ جاري تحميل المستخدمين...</div>;
  if (error) return <div style={{ textAlign: 'center', padding: '40px', color: '#e74c3c' }}>❌ {error}</div>;

  return (
    <div style={{ direction: 'rtl' }}>
      {message && (
        <div style={{
          padding: '12px', marginBottom: '15px', borderRadius: '6px',
          background: message.type === 'success' ? '#d4edda' : message.type === 'warning' ? '#fff3cd' : '#f8d7da',
          color: message.type === 'success' ? '#155724' : message.type === 'warning' ? '#856404' : '#721c24',
          fontWeight: 'bold'
        }}>
          {message.type === 'success' ? '✅' : message.type === 'warning' ? '⚠️' : '❌'} {message.text}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ margin: 0, color: '#1F4E78' }}>👥 قائمة المستخدمين</h3>
        <button onClick={openAddModal} style={{ padding: '8px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          + إضافة مستخدم جديد
        </button>
      </div>

      <div style={{ overflowX: 'auto', background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
          <thead style={{ background: '#1F4E78', color: 'white' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'right' }}>اسم المستخدم</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>البريد الإلكتروني</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الاسم الكامل</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>الدور</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>الحالة</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>تاريخ الإنشاء</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center' }}>لا توجد مستخدمين</td></tr>
            ) : (
              users.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>{user.username}</td>
                  <td style={{ padding: '12px' }}>{user.email || '—'}</td>
                  <td style={{ padding: '12px' }}>{user.full_name || '—'}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{ background: getRoleBadgeColor(getRoleName(user.role_id)), color: 'white', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
                      {getRoleName(user.role_id)}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{ background: user.is_active ? '#d4edda' : '#f8d7da', color: user.is_active ? '#155724' : '#721c24', padding: '4px 10px', borderRadius: '20px', fontSize: '12px' }}>
                      {user.is_active ? 'نشط' : 'معطل'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '12px' }}>
                    {new Date(user.created_at).toLocaleDateString('ar-SA')}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <button onClick={() => openEditModal(user)} style={{ padding: '4px 10px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: '8px', fontSize: '12px' }}>✏️ تعديل</button>
                    <button onClick={() => handleDelete(user)} style={{ padding: '4px 10px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }} disabled={user.username === 'admin'}>🗑️ حذف</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal للإضافة/التعديل */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '8px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflow: 'auto', padding: '20px' }}>
            <h3 style={{ marginTop: 0, color: '#1F4E78' }}>{editingUser ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}</h3>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>اسم المستخدم *</label>
                <input type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} required style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>البريد الإلكتروني</label>
                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>الاسم الكامل</label>
                <input type="text" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>كلمة المرور {editingUser && '(اتركها فارغة إذا لم ترغب في التغيير)'}</label>
                <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required={!editingUser} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>الدور</label>
                <select value={formData.role_id} onChange={e => setFormData({...formData, role_id: e.target.value})} required style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
                  {roles.map(role => <option key={role.id} value={role.id}>{role.name} - {role.description}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} />
                  <span>حساب نشط</span>
                </label>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '8px 16px', background: '#ecf0f1', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" disabled={submitting} style={{ padding: '8px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>{submitting ? 'جاري الحفظ...' : (editingUser ? 'تحديث' : 'إضافة')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;