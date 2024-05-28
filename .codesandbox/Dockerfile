FROM node:20

# Copy the application code and dependencies
COPY . /app

# Set the working directory
WORKDIR /app

# Install dependencies
RUN npm install

# Expose the desired port (if applicable)
EXPOSE 3000

# Specify the command to run the application
CMD ["npm", "start"]

