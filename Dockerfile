# FROM node:lts-bullseye-slim
FROM node:16-alpine

# Arguments

#ARG PORT=4000
#ARG DB_HOST
#ARG DB_DATABASE=VariamosDB
#ARG DB_PORT=5432
#ARG DB_SSL=true
#ARG DB_USER
#ARG DB_PASSWORD

# Enviroment Vars

#ENV PORT=${PORT}
#ENV DB_HOST=${DB_HOST}
#ENV DB_DATABASE=${DB_DATABASE} 
#ENV DB_PORT=${DB_PORT}
#ENV DB_SSL=${DB_SSL}
#ENV DB_USER=${DB_USER} 
#ENV DB_PASSWORD=${DB_PASSWORD}

# update packages
#RUN apk update

# create root application folder
WORKDIR /variaMosLaboratoryService

# copy configs to /variaMosLaboratoryService folder
COPY package*.json ./
COPY tsconfig.json ./

# COPY dist/ ./dist

RUN npm install
# RUN npm install -g typescript
# RUN npm i --save-dev @types/node

# copy source code to /variaMosLaboratoryService/src folder
COPY ./ . 

# # check files list
# RUN ls -a

RUN npm run build


# RUN groupadd veryhigh -g 1516583083
# RUN useradd -r -u 1516583083 -g veryhigh veryhigh
# RUN touch file-with-high-id
# RUN chown veryhigh:veryhigh file-with-high-id

#RUN chown -R root:root /home
#RUN chown -R root:root /var

EXPOSE 4000

CMD [ "npm", "start" ]
