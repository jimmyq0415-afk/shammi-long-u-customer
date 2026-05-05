import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'

const customerColors = {
  primary: '#E5DDD0',
  secondary: '#B1CAC0',
  accent: '#7A8F9A',
  warm: '#AE7045',
  muted: '#A2907C',
  text: '#4d4a46',
  white: '#ffffff',
}

export default function App() {
  const [tableNumber, setTableNumber] = useState('')
  const [confirmedTable, setConfirmedTable] = useState('')
  const [menuItems, setMenuItems] = useState([])
  const [menuCategories, setMenuCategories] = useState([])
  const [optionsMap, setOptionsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedOptionIds, setSelectedOptionIds] = useState([])
  const [customNote, setCustomNote] = useState('')

  const [cart, setCart] = useState([])
  const [showCart, setShowCart] = useState(false)

  const [checkoutResult, setCheckoutResult] = useState('')
  const [submittingOrder, setSubmittingOrder] = useState(false)

  const categoryRefs = useRef({})

  async function fetchMenuItems() {
    setLoading(true)

    const [
      { data: menuData, error: menuError },
      { data: optionData, error: optionError },
      { data: categoryData, error: categoryError },
    ] = await Promise.all([
      supabase
        .from('menu_items')
        .select('*')
        .eq('is_available', true)
        .order('id', { ascending: true }),
      supabase
        .from('menu_item_options')
        .select('*')
        .order('id', { ascending: true }),
      supabase
        .from('menu_categories')
        .select('*')
        .order('sort_order', { ascending: true }),
    ])

    setLoading(false)

    if (menuError) {
      setMessage('讀取菜單失敗：' + menuError.message)
      return
    }

    if (optionError) {
      setMessage('讀取選項失敗：' + optionError.message)
      return
    }

    if (categoryError) {
      setMessage('讀取分類失敗：' + categoryError.message)
      return
    }

    const groupedOptions = {}
    ;(optionData || []).forEach((option) => {
      if (!groupedOptions[option.menu_item_id]) groupedOptions[option.menu_item_id] = []
      groupedOptions[option.menu_item_id].push(option)
    })

    setMenuItems(menuData || [])
    setMenuCategories(categoryData || [])
    setOptionsMap(groupedOptions)
  }

  useEffect(() => {
    fetchMenuItems()
  }, [])

  function handleConfirmTable(e) {
    e.preventDefault()

    if (!tableNumber.trim()) {
      setMessage('請先輸入桌號')
      return
    }

    setConfirmedTable(tableNumber.trim())
    setMessage('')
  }

  function handleBackToTableInput() {
    setConfirmedTable('')
    setCart([])
    setShowCart(false)
    setCheckoutResult('')
    setSelectedItem(null)
    setSelectedOptionIds([])
    setCustomNote('')
  }

  const groupedMenu = useMemo(() => {
    const grouped = {}

    menuItems.forEach((item) => {
      const category = item.category?.trim() || '其他'
      if (!grouped[category]) grouped[category] = []
      grouped[category].push(item)
    })

    const orderedGrouped = {}

    menuCategories.forEach((category) => {
      if (grouped[category.name]) {
        orderedGrouped[category.name] = grouped[category.name]
      }
    })

    Object.keys(grouped).forEach((category) => {
      if (!orderedGrouped[category]) {
        orderedGrouped[category] = grouped[category]
      }
    })

    return orderedGrouped
  }, [menuItems, menuCategories])

  const categories = useMemo(() => Object.keys(groupedMenu), [groupedMenu])

  function scrollToCategory(category) {
    const target = categoryRefs.current[category]

    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  }

  function openItemModal(item) {
    setSelectedItem(item)
    setSelectedOptionIds([])
    setCustomNote('')
  }

  function closeItemModal() {
    setSelectedItem(null)
    setSelectedOptionIds([])
    setCustomNote('')
  }

  function toggleOption(optionId) {
    setSelectedOptionIds((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
    )
  }

  const selectedItemOptions = selectedItem ? optionsMap[selectedItem.id] || [] : []

  const selectedOptions = selectedItemOptions.filter((option) =>
    selectedOptionIds.includes(option.id)
  )

  const modalTotal = selectedItem
    ? selectedItem.price +
      selectedOptions.reduce((sum, option) => sum + (option.price_delta || 0), 0)
    : 0

  function addToCart() {
    if (!selectedItem) return

    const selectedOptionsForCart = selectedOptions.map((option) => ({
      id: option.id,
      label: option.label,
      price_delta: option.price_delta || 0,
    }))

    const itemTotal =
      selectedItem.price +
      selectedOptionsForCart.reduce((sum, option) => sum + option.price_delta, 0)

    const cartItem = {
      cartId: Date.now() + Math.random(),
      menu_item_id: selectedItem.id,
      item_name: selectedItem.name,
      base_price: selectedItem.price,
      quantity: 1,
      selected_options: selectedOptionsForCart,
      customer_note: selectedItem.allow_custom_note ? customNote.trim() : '',
      total_price: itemTotal,
    }

    setCart((prev) => [...prev, cartItem])
    closeItemModal()
  }

  function removeCartItem(cartId) {
    setCart((prev) => prev.filter((item) => item.cartId !== cartId))
  }

  function finishAndBackToMenu() {
    setCart([])
    setShowCart(false)
    setCheckoutResult('')
  }

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  const cartTotal = cart.reduce((sum, item) => sum + item.total_price * item.quantity, 0)

  async function submitOrder(paymentMethod) {
    if (cart.length === 0) return

    if (paymentMethod === 'online') {
      setCheckoutResult('尚未開放此功能')
      return
    }

    setSubmittingOrder(true)

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert([
        {
          table_number: confirmedTable,
          payment_method: 'cash',
          status: 'pending',
          total_amount: cartTotal,
        },
      ])
      .select()
      .single()

    if (orderError) {
      setSubmittingOrder(false)
      setCheckoutResult('送出訂單失敗：' + orderError.message)
      return
    }

    const orderItemsPayload = cart.map((item) => ({
      order_id: orderData.id,
      menu_item_id: item.menu_item_id,
      item_name: item.item_name,
      unit_price: item.total_price,
      quantity: item.quantity,
      selected_options: item.selected_options,
      customer_note: item.customer_note || '',
    }))

    const { error: orderItemsError } = await supabase
      .from('order_items')
      .insert(orderItemsPayload)

    setSubmittingOrder(false)

    if (orderItemsError) {
      setCheckoutResult('送出訂單明細失敗：' + orderItemsError.message)
      return
    }

    setCheckoutResult('請至櫃檯付款')
  }

  if (!confirmedTable) {
    return (
      <div style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={styles.tableCard}>
            <h1 style={styles.brandTitle}>蝦米攏烏</h1>
            <p style={styles.brandSubtitle}>請先輸入桌號，再開始點餐。</p>

            <form onSubmit={handleConfirmTable} style={styles.form}>
              <label style={styles.label}>桌號</label>
              <input
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="例如：A3、5號桌"
                style={styles.input}
              />

              <button type="submit" style={styles.primaryButton}>
                進入菜單
              </button>
            </form>

            {message ? <p style={styles.message}>{message}</p> : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.customerContainer}>
        <div style={styles.topBar}>
          <div>
            <h1 style={styles.brandTitle}>蝦米攏烏</h1>
            <p style={styles.brandSubtitle}>桌號：{confirmedTable}</p>
          </div>

          <div style={styles.topBarButtons}>
            <button style={styles.secondaryButton} onClick={() => setShowCart(true)}>
              購物車（{cartCount}）
            </button>
            <button style={styles.secondaryButton} onClick={handleBackToTableInput}>
              更換桌號
            </button>
          </div>
        </div>

        {loading ? (
          <div style={styles.statusCard}>菜單載入中...</div>
        ) : message ? (
          <div style={styles.statusCard}>{message}</div>
        ) : menuItems.length === 0 ? (
          <div style={styles.statusCard}>目前尚未上架任何商品</div>
        ) : (
          <div style={styles.menuWrap}>
            <div style={styles.categoryTabs}>
              {categories.map((category) => (
                <button
                  key={category}
                  style={styles.categoryButton}
                  onClick={() => scrollToCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            {Object.entries(groupedMenu).map(([category, items]) => (
              <section
                key={category}
                ref={(element) => {
                  categoryRefs.current[category] = element
                }}
                style={styles.categorySection}
              >
                <h2 style={styles.categoryTitle}>{category}</h2>

                <div style={styles.menuGrid}>
                  {items.map((item) => (
                    <div key={item.id} style={styles.itemCard}>
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} style={styles.itemImage} />
                      ) : (
                        <div style={styles.imagePlaceholder}>無圖片</div>
                      )}

                      <div style={styles.itemContent}>
                        <div style={styles.itemHeader}>
                          <div style={styles.itemName}>{item.name}</div>
                          <div style={styles.itemPrice}>NT$ {item.price}</div>
                        </div>

                        <div style={styles.itemNote}>
                          {item.note ? item.note : '無商品說明'}
                        </div>

                        <button style={styles.primaryButton} onClick={() => openItemModal(item)}>
                          查看餐點
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {cartCount > 0 && !showCart ? (
          <button style={styles.cartFloatingButton} onClick={() => setShowCart(true)}>
            購物車（{cartCount}）
          </button>
        ) : null}
      </div>

      {selectedItem ? (
        <div style={styles.modalOverlay} onClick={closeItemModal}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>{selectedItem.name}</h2>
                <p style={styles.modalPrice}>NT$ {selectedItem.price}</p>
              </div>
              <button style={styles.closeButton} onClick={closeItemModal}>
                ✕
              </button>
            </div>

            <div style={styles.modalNote}>
              {selectedItem.note ? selectedItem.note : '無商品說明'}
            </div>

            <div style={styles.modalSection}>
              <h3 style={styles.modalSectionTitle}>可勾選選項</h3>

              {selectedItemOptions.length === 0 ? (
                <div style={styles.emptyText}>此商品目前沒有可勾選選項</div>
              ) : (
                <div style={styles.optionList}>
                  {selectedItemOptions.map((option) => {
                    const checked = selectedOptionIds.includes(option.id)

                    return (
                      <label key={option.id} style={styles.optionRow}>
                        <div style={styles.optionLeft}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOption(option.id)}
                          />
                          <span style={styles.optionLabel}>{option.label}</span>
                        </div>
                        <span style={styles.optionPrice}>
                          {option.price_delta > 0 ? `+ NT$ ${option.price_delta}` : '不加價'}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {selectedItem.allow_custom_note ? (
              <div style={styles.modalSection}>
                <h3 style={styles.modalSectionTitle}>額外備註</h3>
                <textarea
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder="例如：不要太鹹、醬另外放"
                  style={styles.textarea}
                />
              </div>
            ) : null}

            <div style={styles.modalFooter}>
              <div style={styles.totalText}>小計：NT$ {modalTotal}</div>
              <button style={styles.primaryButton} onClick={addToCart}>
                加入購物車
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCart ? (
        <div style={styles.modalOverlay} onClick={() => setShowCart(false)}>
          <div style={styles.cartModalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>購物車</h2>
                <p style={styles.modalPrice}>桌號：{confirmedTable}</p>
              </div>
              <button style={styles.closeButton} onClick={() => setShowCart(false)}>
                ✕
              </button>
            </div>

            {checkoutResult ? (
              <div style={styles.checkoutResultBox}>
                <div style={styles.checkoutResultText}>{checkoutResult}</div>
                <button style={styles.primaryButton} onClick={finishAndBackToMenu}>
                  回到菜單
                </button>
              </div>
            ) : cart.length === 0 ? (
              <div style={styles.emptyText}>目前購物車是空的</div>
            ) : (
              <>
                <div style={styles.cartList}>
                  {cart.map((item) => (
                    <div key={item.cartId} style={styles.cartItem}>
                      <div style={styles.cartItemTop}>
                        <div style={styles.cartItemName}>{item.item_name}</div>
                        <div style={styles.cartItemPrice}>NT$ {item.total_price}</div>
                      </div>

                      {item.selected_options.length > 0 ? (
                        <div style={styles.cartMeta}>
                          選項：{item.selected_options.map((opt) => opt.label).join('、')}
                        </div>
                      ) : null}

                      {item.customer_note ? (
                        <div style={styles.cartMeta}>備註：{item.customer_note}</div>
                      ) : null}

                      <button
                        style={styles.removeButton}
                        onClick={() => removeCartItem(item.cartId)}
                      >
                        刪除此品項
                      </button>
                    </div>
                  ))}
                </div>

                <div style={styles.cartSummary}>
                  <div style={styles.totalText}>總金額：NT$ {cartTotal}</div>
                </div>

                <div style={styles.checkoutButtons}>
                  <button
                    style={styles.primaryButton}
                    onClick={() => submitOrder('cash')}
                    disabled={submittingOrder}
                  >
                    {submittingOrder ? '送出中...' : '現金結帳'}
                  </button>
                  <button
                    style={styles.secondaryButton}
                    onClick={() => submitOrder('online')}
                  >
                    線上付款
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${customerColors.primary} 0%, ${customerColors.white} 100%)`,
    padding: '20px 16px 40px',
    fontFamily: '"Noto Serif TC","PMingLiU","MingLiU","Songti TC",serif',
    color: customerColors.text,
    boxSizing: 'border-box',
  },
  centerWrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableCard: {
    width: '100%',
    maxWidth: '460px',
    background: customerColors.white,
    borderRadius: '24px',
    padding: '32px 24px',
    boxShadow: '0 12px 30px rgba(122,143,154,0.18)',
    border: `1px solid ${customerColors.secondary}`,
  },
  customerContainer: {
    maxWidth: '1180px',
    margin: '0 auto',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  topBarButtons: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  brandTitle: {
    margin: 0,
    fontSize: '38px',
    lineHeight: 1.2,
    color: customerColors.warm,
    fontWeight: 700,
  },
  brandSubtitle: {
    marginTop: '10px',
    marginBottom: 0,
    fontSize: '18px',
    color: customerColors.muted,
  },
  form: {
    display: 'grid',
    gap: '14px',
    marginTop: '24px',
  },
  label: {
    fontSize: '19px',
    fontWeight: 700,
    color: customerColors.text,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '16px 18px',
    borderRadius: '16px',
    border: `1px solid ${customerColors.secondary}`,
    background: customerColors.white,
    fontSize: '18px',
    fontFamily: 'inherit',
    outline: 'none',
    color: customerColors.text,
  },
  primaryButton: {
    border: 'none',
    borderRadius: '16px',
    padding: '14px 18px',
    background: customerColors.accent,
    color: customerColors.white,
    fontSize: '18px',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  secondaryButton: {
    border: `1px solid ${customerColors.muted}`,
    borderRadius: '16px',
    padding: '12px 16px',
    background: customerColors.white,
    color: customerColors.text,
    fontSize: '17px',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  removeButton: {
    marginTop: '10px',
    border: 'none',
    borderRadius: '12px',
    padding: '10px 14px',
    background: '#b55a52',
    color: customerColors.white,
    fontSize: '15px',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  message: {
    marginTop: '18px',
    fontSize: '17px',
    fontWeight: 700,
    color: '#9b4f42',
  },
  statusCard: {
    background: customerColors.white,
    border: `1px solid ${customerColors.secondary}`,
    borderRadius: '20px',
    padding: '28px',
    fontSize: '18px',
    boxShadow: '0 10px 24px rgba(122,143,154,0.12)',
  },
  menuWrap: {
    display: 'grid',
    gap: '28px',
  },
  categoryTabs: {
    position: 'sticky',
    top: '0',
    zIndex: 10,
    display: 'flex',
    gap: '10px',
    overflowX: 'auto',
    padding: '12px 4px 16px',
    background: `linear-gradient(180deg, ${customerColors.primary} 0%, rgba(255,255,255,0.92) 100%)`,
    backdropFilter: 'blur(8px)',
  },
  categoryButton: {
    flex: '0 0 auto',
    border: `1px solid ${customerColors.secondary}`,
    borderRadius: '999px',
    padding: '10px 18px',
    background: customerColors.white,
    color: customerColors.text,
    fontSize: '17px',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: '0 6px 14px rgba(122,143,154,0.12)',
  },
  categorySection: {
    display: 'grid',
    gap: '16px',
    scrollMarginTop: '92px',
  },
  categoryTitle: {
    margin: 0,
    fontSize: '28px',
    color: customerColors.warm,
    textAlign: 'center',
  },
  menuGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '18px',
  },
  itemCard: {
    background: customerColors.white,
    borderRadius: '22px',
    overflow: 'hidden',
    border: `1px solid ${customerColors.secondary}`,
    boxShadow: '0 10px 24px rgba(122,143,154,0.12)',
    display: 'flex',
    flexDirection: 'column',
  },
  itemImage: {
    width: '100%',
    height: '210px',
    objectFit: 'cover',
    background: customerColors.primary,
  },
  imagePlaceholder: {
    width: '100%',
    height: '210px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f6f2eb',
    color: customerColors.muted,
    fontSize: '18px',
  },
  itemContent: {
    padding: '18px',
    display: 'grid',
    gap: '14px',
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'flex-start',
  },
  itemName: {
    fontSize: '24px',
    fontWeight: 700,
    color: customerColors.text,
  },
  itemPrice: {
    fontSize: '20px',
    fontWeight: 700,
    color: customerColors.warm,
    whiteSpace: 'nowrap',
  },
  itemNote: {
    fontSize: '16px',
    lineHeight: 1.7,
    color: customerColors.muted,
    minHeight: '54px',
  },
  cartFloatingButton: {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    border: 'none',
    borderRadius: '999px',
    padding: '16px 22px',
    background: customerColors.warm,
    color: customerColors.white,
    fontSize: '18px',
    fontWeight: 700,
    fontFamily: 'inherit',
    boxShadow: '0 10px 24px rgba(174,112,69,0.25)',
    cursor: 'pointer',
    zIndex: 20,
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '18px',
    zIndex: 30,
  },
  modalCard: {
    width: '100%',
    maxWidth: '620px',
    maxHeight: '90vh',
    overflowY: 'auto',
    background: customerColors.white,
    borderRadius: '24px',
    padding: '24px',
    boxShadow: '0 14px 32px rgba(0,0,0,0.18)',
  },
  cartModalCard: {
    width: '100%',
    maxWidth: '720px',
    maxHeight: '90vh',
    overflowY: 'auto',
    background: customerColors.white,
    borderRadius: '24px',
    padding: '24px',
    boxShadow: '0 14px 32px rgba(0,0,0,0.18)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    alignItems: 'flex-start',
  },
  modalTitle: {
    margin: 0,
    fontSize: '32px',
    color: customerColors.text,
  },
  modalPrice: {
    marginTop: '8px',
    marginBottom: 0,
    fontSize: '20px',
    color: customerColors.warm,
    fontWeight: 700,
  },
  closeButton: {
    border: 'none',
    background: 'transparent',
    fontSize: '26px',
    cursor: 'pointer',
    color: customerColors.text,
  },
  modalNote: {
    marginTop: '14px',
    fontSize: '17px',
    lineHeight: 1.8,
    color: customerColors.muted,
  },
  modalSection: {
    marginTop: '24px',
  },
  modalSectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '22px',
    color: customerColors.warm,
  },
  emptyText: {
    fontSize: '16px',
    color: customerColors.muted,
  },
  optionList: {
    display: 'grid',
    gap: '10px',
  },
  optionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'center',
    padding: '12px 14px',
    borderRadius: '14px',
    border: `1px solid ${customerColors.secondary}`,
    background: '#faf8f4',
  },
  optionLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  optionLabel: {
    fontSize: '17px',
    color: customerColors.text,
  },
  optionPrice: {
    fontSize: '16px',
    color: customerColors.warm,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  textarea: {
    width: '100%',
    minHeight: '110px',
    boxSizing: 'border-box',
    padding: '14px 16px',
    borderRadius: '16px',
    border: `1px solid ${customerColors.secondary}`,
    background: customerColors.white,
    fontSize: '17px',
    fontFamily: 'inherit',
    resize: 'vertical',
    outline: 'none',
    color: customerColors.text,
  },
  modalFooter: {
    marginTop: '24px',
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  cartList: {
    display: 'grid',
    gap: '14px',
    marginTop: '16px',
  },
  cartItem: {
    border: `1px solid ${customerColors.secondary}`,
    borderRadius: '16px',
    padding: '16px',
    background: '#faf8f4',
  },
  cartItemTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'flex-start',
  },
  cartItemName: {
    fontSize: '21px',
    fontWeight: 700,
    color: customerColors.text,
  },
  cartItemPrice: {
    fontSize: '18px',
    fontWeight: 700,
    color: customerColors.warm,
    whiteSpace: 'nowrap',
  },
  cartMeta: {
    marginTop: '8px',
    fontSize: '16px',
    color: customerColors.muted,
    lineHeight: 1.7,
  },
  cartSummary: {
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: `1px solid ${customerColors.secondary}`,
  },
  checkoutButtons: {
    marginTop: '18px',
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  checkoutResultBox: {
    marginTop: '20px',
    display: 'grid',
    gap: '16px',
  },
  checkoutResultText: {
    fontSize: '22px',
    fontWeight: 700,
    color: customerColors.warm,
    lineHeight: 1.7,
    textAlign: 'center',
  },
  totalText: {
    fontSize: '22px',
    color: customerColors.text,
    fontWeight: 700,
  },
}
