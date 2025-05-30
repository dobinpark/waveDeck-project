FROM node:18 As development
WORKDIR /usr/src/app
COPY package*.json ./

COPY tsconfig*.json ./

RUN npm install

COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

FROM node:18-alpine
WORKDIR /app
COPY --from=development /usr/src/app/dist ./dist
COPY --from=development /usr/src/app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
