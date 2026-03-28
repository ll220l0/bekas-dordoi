import { randomBytes, scryptSync } from "node:crypto";
import { AdminUserRole, PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const DEFAULT_ADMIN_FIRST_NAME = "Admin";
const DEFAULT_ADMIN_LAST_NAME = "Owner";
const DEFAULT_ADMIN_PHONE = "996555000000";
const DEFAULT_RESTAURANT_NAME = "Beka's Burger";
const LEGACY_DEFAULT_RESTAURANT_SLUG = "dordoi-food";
const DEFAULT_RESTAURANT_SLUG =
  process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG?.trim() || LEGACY_DEFAULT_RESTAURANT_SLUG;
const DEFAULT_ITEM_PHOTO_URL = "/brand/bekas-burger-logo.jpg";
const INITIAL_MENU = [
  {
    title: "Шаурма",
    sortOrder: 1,
    items: [
      { title: "Запеченная", priceKgs: 270, description: "Запеченная шаурма с хрустящей корочкой" },
      { title: "Классическая", priceKgs: 250, description: "Классическая шаурма с сочной начинкой" },
      { title: "Мини шаурма", priceKgs: 210, description: "Компактная шаурма для легкого перекуса" },
      { title: "Шаурма чизбургер", priceKgs: 270, description: "Шаурма со вкусом чизбургера и сыром" },
      { title: "Big Taste шаурма", priceKgs: 280, description: "Большая шаурма с насыщенным вкусом" },
      { title: "Кисло-сладкая", priceKgs: 260, description: "Шаурма с кисло-сладким соусом" },
      { title: "Шаурма 3 сыра", priceKgs: 280, description: "Шаурма с тремя видами сыра" },
      { title: "Острая шаурма", priceKgs: 270, description: "Острая шаурма, чалап в подарок" },
    ],
  },
  {
    title: "Бургеры",
    sortOrder: 2,
    items: [
      { title: "Гамбургер", priceKgs: 200, description: "Классический бургер с котлетой и соусом" },
      { title: "Шаурдог", priceKgs: 200, description: "Хот-дог в стиле шаурмы с сочной начинкой" },
      { title: "Хот-дог", priceKgs: 170, description: "Хот-дог с сосиской и фирменным соусом" },
    ],
  },
  {
    title: "Закуски",
    sortOrder: 3,
    items: [
      { title: "Фри", priceKgs: 120, description: "Хрустящий картофель фри" },
      { title: "Картошка по-деревенски", priceKgs: 140, description: "Румяная картошка по-деревенски" },
    ],
  },
  {
    title: "Самсы",
    sortOrder: 4,
    items: [
      { title: "С курицей и сыром", priceKgs: 90, description: "Самса с курицей и тянущимся сыром" },
      { title: "С мясом", priceKgs: 85, description: "Самса с сочной мясной начинкой" },
      { title: "С курицей", priceKgs: 85, description: "Самса с нежной куриной начинкой" },
    ],
  },
  {
    title: "Напитки",
    sortOrder: 5,
    items: [
      { title: "Фанта 1,5л", priceKgs: 160, description: "Газированный напиток Fanta, 1,5 л" },
      { title: "Пепси 1,5л", priceKgs: 160, description: "Газированный напиток Pepsi, 1,5 л" },
      { title: "Кола 1,5л", priceKgs: 160, description: "Газированный напиток Cola, 1,5 л" },
      { title: "Спрайт 1,5л", priceKgs: 160, description: "Газированный напиток Sprite, 1,5 л", isAvailable: false },
      { title: "Фанта 1л", priceKgs: 110, description: "Газированный напиток Fanta, 1 л" },
      { title: "Пепси 1л", priceKgs: 110, description: "Газированный напиток Pepsi, 1 л" },
      { title: "Кола 1л", priceKgs: 110, description: "Газированный напиток Cola, 1 л" },
      { title: "Спрайт 1л", priceKgs: 110, description: "Газированный напиток Sprite, 1 л" },
      { title: "Фанта 0,5л", priceKgs: 85, description: "Газированный напиток Fanta, 0,5 л" },
      { title: "Пепси 0,5л", priceKgs: 85, description: "Газированный напиток Pepsi, 0,5 л" },
      { title: "Кола 0,5л", priceKgs: 85, description: "Газированный напиток Cola, 0,5 л" },
      { title: "Спрайт 0,5л", priceKgs: 85, description: "Газированный напиток Sprite, 0,5 л" },
      { title: "Фьюс ти 1л", priceKgs: 110, description: "Холодный чай Fuse Tea, 1 л" },
      { title: "Липтон 1л", priceKgs: 110, description: "Холодный чай Lipton, 1 л" },
      { title: "Фьюс ти 0,5л", priceKgs: 85, description: "Холодный чай Fuse Tea, 0,5 л" },
      { title: "Липтон 0,5л", priceKgs: 85, description: "Холодный чай Lipton, 0,5 л" },
      { title: "Пико 1л", priceKgs: 160, description: "Сок Piko, 1 л" },
      { title: "Пико 0,5л", priceKgs: 90, description: "Сок Piko, 0,5 л" },
      { title: "Бон Аква 1л", priceKgs: 60, description: "Питьевая вода Bon Aqua, 1 л" },
      { title: "Бон Аква 0,5л", priceKgs: 50, description: "Питьевая вода Bon Aqua, 0,5 л" },
      { title: "Пепси ж/б", priceKgs: 90, description: "Pepsi в жестяной банке" },
      { title: "7UP ж/б", priceKgs: 90, description: "7UP в жестяной банке" },
      { title: "Mirinda ж/б", priceKgs: 90, description: "Mirinda в жестяной банке" },
      { title: "Кола ж/б", priceKgs: 90, description: "Cola в жестяной банке" },
      { title: "Фанта ж/б", priceKgs: 90, description: "Fanta в жестяной банке" },
      { title: "Швепс ж/б", priceKgs: 90, description: "Schweppes в жестяной банке" },
    ],
  },
];

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

async function canReplaceLegacySlug(restaurantId, currentSlug) {
  if (currentSlug !== LEGACY_DEFAULT_RESTAURANT_SLUG) return false;
  if (DEFAULT_RESTAURANT_SLUG === LEGACY_DEFAULT_RESTAURANT_SLUG) return false;
  const existing = await prisma.restaurant.findUnique({
    where: { slug: DEFAULT_RESTAURANT_SLUG },
    select: { id: true },
  });
  return !existing || existing.id === restaurantId;
}

async function ensureDefaultAdmin() {
  const activeAdmin = await prisma.adminUser.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (activeAdmin) {
    console.log(`Active admin already exists: ${activeAdmin.username}`);
    return activeAdmin;
  }

  const passwordHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
  const admin = await prisma.$transaction(async (tx) => {
    const user = await tx.adminUser.upsert({
      where: { username: DEFAULT_ADMIN_USERNAME },
      update: {
        passwordHash,
        role: AdminUserRole.owner,
        isActive: true,
      },
      create: {
        username: DEFAULT_ADMIN_USERNAME,
        passwordHash,
        role: AdminUserRole.owner,
        isActive: true,
      },
    });

    await tx.adminProfile.upsert({
      where: { username: DEFAULT_ADMIN_USERNAME },
      update: {
        firstName: DEFAULT_ADMIN_FIRST_NAME,
        lastName: DEFAULT_ADMIN_LAST_NAME,
        phone: DEFAULT_ADMIN_PHONE,
      },
      create: {
        username: DEFAULT_ADMIN_USERNAME,
        firstName: DEFAULT_ADMIN_FIRST_NAME,
        lastName: DEFAULT_ADMIN_LAST_NAME,
        phone: DEFAULT_ADMIN_PHONE,
        avatarUrl: null,
      },
    });

    return user;
  });

  console.log(`Ensured default admin in DB: ${admin.username}`);
  return admin;
}

async function ensureBaseRestaurant() {
  const activeRestaurant = await prisma.restaurant.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (activeRestaurant) {
    const shouldUpdateLegacySlug = await canReplaceLegacySlug(
      activeRestaurant.id,
      activeRestaurant.slug,
    );

    if (activeRestaurant.name === "Dordoi Food" || shouldUpdateLegacySlug) {
      const updated = await prisma.restaurant.update({
        where: { id: activeRestaurant.id },
        data: {
          name: activeRestaurant.name === "Dordoi Food" ? DEFAULT_RESTAURANT_NAME : activeRestaurant.name,
          ...(shouldUpdateLegacySlug ? { slug: DEFAULT_RESTAURANT_SLUG } : {}),
        },
      });
      console.log(`Updated restaurant brand: ${updated.slug}`);
      return updated;
    }
    console.log(`Active restaurant already exists: ${activeRestaurant.slug}`);
    return activeRestaurant;
  }

  const restaurant = await prisma.restaurant.create({
    data: {
      slug: DEFAULT_RESTAURANT_SLUG,
      name: DEFAULT_RESTAURANT_NAME,
      qrImageUrl: "/qr/demo-restaurant.png",
      isActive: true,
    },
  });

  console.log(`Created empty restaurant: ${restaurant.slug}`);
  return restaurant;
}

async function ensureCategory(tx, restaurantId, title, sortOrder) {
  const existing = await tx.category.findFirst({
    where: { restaurantId, title },
  });

  if (existing) {
    return tx.category.update({
      where: { id: existing.id },
      data: { sortOrder },
    });
  }

  return tx.category.create({
    data: {
      restaurantId,
      title,
      sortOrder,
    },
  });
}

async function ensureMenuItem(tx, restaurantId, categoryId, item, sortOrder) {
  const existing = await tx.menuItem.findFirst({
    where: { restaurantId, title: item.title },
  });

  if (existing) {
    return tx.menuItem.update({
      where: { id: existing.id },
      data: {
        categoryId,
        description: item.description ?? existing.description ?? null,
        photoUrl: existing.photoUrl || DEFAULT_ITEM_PHOTO_URL,
        priceKgs: item.priceKgs,
        isAvailable: item.isAvailable ?? true,
        sortOrder,
      },
    });
  }

  return tx.menuItem.create({
    data: {
      restaurantId,
      categoryId,
      title: item.title,
      description: item.description ?? null,
      photoUrl: DEFAULT_ITEM_PHOTO_URL,
      priceKgs: item.priceKgs,
      isAvailable: item.isAvailable ?? true,
      sortOrder,
    },
  });
}

async function ensureInitialMenu(restaurant) {
  for (const categorySeed of INITIAL_MENU) {
    const category = await ensureCategory(
      prisma,
      restaurant.id,
      categorySeed.title,
      categorySeed.sortOrder,
    );

    for (const [index, item] of categorySeed.items.entries()) {
      await ensureMenuItem(prisma, restaurant.id, category.id, item, index + 1);
    }
  }

  const categoryCount = await prisma.category.count({
    where: { restaurantId: restaurant.id },
  });
  const itemCount = await prisma.menuItem.count({
    where: { restaurantId: restaurant.id },
  });
  console.log(`Ensured menu: ${categoryCount} categories, ${itemCount} items`);
}

async function main() {
  await ensureDefaultAdmin();
  const restaurant = await ensureBaseRestaurant();
  await ensureInitialMenu(restaurant);
  console.log("Seed completed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
