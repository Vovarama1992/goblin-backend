# Используйте официальный Node.js образ как базовый
FROM node:18

# Установите рабочую директорию
WORKDIR /app

# Скопируйте package.json и package-lock.json для установки зависимостей
COPY package*.json ./

# Установите зависимости
RUN npm install --unsafe-perm --allow-root

# Удалите bcrypt, если он был установлен
RUN npm uninstall bcrypt

# Установите bcryptjs
RUN npm install bcryptjs ts-node --unsafe-perm --allow-root

# Установите Prisma Client
RUN npm install @prisma/client --unsafe-perm=true --allow-root

# Установите глобальные зависимости отдельно
RUN npm install -g nodemon --unsafe-perm=true --allow-root
RUN npm install -g @nestjs/cli --unsafe-perm=true --allow-root

# Скопируйте остальные файлы проекта
COPY . .

# Генерация Prisma Client
RUN npx prisma generate

# Скомпилируйте TypeScript файлы
RUN npm run build

# Запуск скомпилированного приложения
CMD ["npm", "run", "start"]