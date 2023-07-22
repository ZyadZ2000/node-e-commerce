import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

import Product from '../models/product.js';
import Order from '../models/order.js';

const ITEMS_PER_PAGE = 2;

export const getProducts = async (req, res, next) => {
  const page = +req.query.page || 1;

  try {
    const totalItems = await Product.find().countDocuments();
    const products = await Product.find()
      .skip((page - 1) * ITEMS_PER_PAGE)
      .limit(ITEMS_PER_PAGE);

    res.render('shop/product-list', {
      prods: products,
      pageTitle: 'Products',
      path: '/products',
      currentPage: page,
      hasNextPage: ITEMS_PER_PAGE * page < totalItems,
      hasPreviousPage: page > 1,
      nextPage: page + 1,
      previousPage: page - 1,
      lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE),
    });
  } catch (err) {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};

export const getProduct = async (req, res, next) => {
  const prodId = req.params.productId;

  try {
    const product = await Product.findById(prodId);

    res.render('shop/product-detail', {
      product: product,
      pageTitle: product.title,
      path: '/products',
    });
  } catch (err) {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};

export const getIndex = async (req, res, next) => {
  const page = +req.query.page || 1;

  try {
    const totalItems = await Product.find().countDocuments();
    const products = await Product.find()
      .skip((page - 1) * ITEMS_PER_PAGE)
      .limit(ITEMS_PER_PAGE);

    res.render('shop/index', {
      prods: products,
      pageTitle: 'Shop',
      path: '/',
      currentPage: page,
      hasNextPage: ITEMS_PER_PAGE * page < totalItems,
      hasPreviousPage: page > 1,
      nextPage: page + 1,
      previousPage: page - 1,
      lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE),
    });
  } catch (err) {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};

export const getCart = async (req, res, next) => {
  try {
    console.log('hello');
    const user = await req.user.populate('cart.items.productId');
    console.log('world');
    console.log(user.cart);
    const products = user.cart.items;
    res.render('shop/cart', {
      path: '/cart',
      pageTitle: 'Your Cart',
      products: products,
    });
  } catch (err) {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};

export const postCart = async (req, res, next) => {
  try {
    const prodId = req.body.productId;
    const product = await Product.findById(prodId);
    console.log('o');
    await req.user.addToCart(product);
    console.log('n');
    return res.redirect('/cart');
  } catch (err) {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};

export const postCartDeleteProduct = async (req, res, next) => {
  const prodId = req.body.productId;

  try {
    await req.user.removeFromCart(prodId);
    res.redirect('/cart');
  } catch (err) {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};

export const getCheckout = async (req, res, next) => {
  try {
    const session = await req.user.populate('cart.items.productId');
    const products = session.cart.items;
    const total = 0; // You may need to calculate total sum here

    res.render('shop/checkout', {
      path: '/checkout',
      pageTitle: 'Checkout',
      products: products,
      totalSum: total,
      sessionId: session.id,
    });
  } catch (err) {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};

export const getCheckoutSuccess = async (req, res, next) => {
  try {
    const user = await req.user.populate('cart.items.productId');
    const products = user.cart.items.map((i) => {
      return { quantity: i.quantity, product: { ...i.productId._doc } };
    });

    const order = new Order({
      user: {
        email: req.user.email,
        userId: req.user,
      },
      products: products,
    });

    await order.save();
    await req.user.clearCart();

    res.redirect('/orders');
  } catch (err) {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};

export const postOrder = async (req, res, next) => {
  try {
    const user = await req.user.populate('cart.items.productId');
    const products = user.cart.items.map((i) => {
      return { quantity: i.quantity, product: { ...i.productId._doc } };
    });

    const order = new Order({
      user: {
        email: req.user.email,
        userId: req.user,
      },
      products: products,
    });

    await order.save();
    await req.user.clearCart();

    res.redirect('/orders');
  } catch (err) {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};

export const getOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ 'user.userId': req.user._id });

    res.render('shop/orders', {
      path: '/orders',
      pageTitle: 'Your Orders',
      orders: orders,
    });
  } catch (err) {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};

export const getInvoice = async (req, res, next) => {
  const orderId = req.params.orderId;

  try {
    const order = await Order.findById(orderId);

    if (!order) {
      return next(new Error('No order found.'));
    }

    if (order.user.userId.toString() !== req.user._id.toString()) {
      return next(new Error('Unauthorized'));
    }

    const invoiceName = 'invoice-' + orderId + '.pdf';
    const invoicePath = path.join('data', 'invoices', invoiceName);

    const pdfDoc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'inline; filename="' + invoiceName + '"'
    );
    pdfDoc.pipe(fs.createWriteStream(invoicePath));
    pdfDoc.pipe(res);

    pdfDoc.fontSize(26).text('Invoice', { underline: true });
    pdfDoc.text('-----------------------');
    let totalPrice = 0;
    order.products.forEach((prod) => {
      totalPrice += prod.quantity * prod.product.price;
      pdfDoc
        .fontSize(14)
        .text(
          prod.product.title +
            ' - ' +
            prod.quantity +
            ' x ' +
            '$' +
            prod.product.price
        );
    });
    pdfDoc.text('---');
    pdfDoc.fontSize(20).text('Total Price: $' + totalPrice);

    pdfDoc.end();
  } catch (err) {
    next(err);
  }
};
