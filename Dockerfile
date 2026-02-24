# Use an official Node.js runtime as a parent image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if any) to the working directory
# to install dependencies
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the TypeScript project
RUN npm run build

# Expose the port the app runs on (if applicable, default for express is 3000)
# You might need to adjust this if your Cozo app uses a different port
EXPOSE 3000

# Define the command to run your app
CMD [ "npm", "start" ]
