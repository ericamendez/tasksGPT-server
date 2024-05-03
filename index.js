const { ApolloServer } = require('@apollo/server')
const { startStandaloneServer } = require('@apollo/server/standalone')
const { v1: uuid } = require('uuid')
const { ApolloServer: ApolloServerExpress } = require('apollo-server-express'); // Import ApolloServer from apollo-server-express with a different name
const { GraphQLError } = require('graphql')
const mongoose = require('mongoose')
const Task = require('./models/task')
const User = require('./models/user')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require("path");
const { OpenAI } = require('openai');
const cors = require('cors')
const express = require('express');

mongoose.set('strictQuery', false)

require('dotenv').config()

const MONGODB_URI = process.env.MONGODB_URI

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connection to MongoDB:', error.message)
  })

const typeDefs = `
  type Task {
    title: String!
    id: ID!
    description: String
    priority: String
    status: String
    user: String!
    complete: Boolean
  }

  type User {
    username: String!
    id: ID!
  }
  
  type Token {
    value: String!
  }

  type Query {
    dummy: Int
    taskCount: Int!
    allTasks: [Task!]!
    me: User
  }

  type Mutation {
    addTask(
      title: String!
      description: String
      priority: String
      status: String
      user: String!
      complete: Boolean
    ): Task
    editComplete(
      id: String!
      complete: Boolean
    ): Task
    editDescription(
      id: String!
      description: String
    ): Task
    editPriority(
      id: String!
      priority: String
    ): Task
    editStatus(
      id: String!
      status: String
    ): Task
    createUser(
      username: String!
      password: String!
    ): User
    login(
      username: String!
      password: String!
    ): Token
    autogenerate(
      title: String!
    ): String
    deleteCompletedTasks: String
  }
`

const resolvers = {
  Query: {
    dummy: () => 0,
    taskCount: () => tasks.collection.countDocuments(),
    allTasks: async () => {
      return Task.find({})
    },
    me: (root, args, context) => {
      return context.currentUser
    }
  },

  Mutation: {
    addTask: async (root, args) => {
      try {
        // Check if a task with the given title already exists
        const existingTask = await Task.findOne({ title: args.title });

        if (existingTask) {
          // Task with the same title already exists, you can choose to update it or throw an error
          throw new Error('Task with the same title already exists');
        }
        let description = await chatGPTDescriptionCompletion(args.title)
        console.log('addTask', description);
        // Create and save a new task
        const newTask = new Task({ ...args, description: args.description ? args.description : description });
        await newTask.save();

        console.log('newTask', newTask)
        return newTask;
      } catch (error) {
        // Handle errors
        console.error('Error adding task:', error);
        throw new Error('Failed to add task');
      }
    },
    editComplete: async (root, args) => {

      console.log(args.id);
      const task = await Task.findOne({ _id: args.id })
      console.log(task);
      task.complete = args.complete

      try {
        await task.save()
      } catch (error) {
        throw new GraphQLError('toggling complete not working', {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.id,
            error
          }
        })
      }

      return task
    },
    editDescription: async (root, args) => {
      const task = await Task.findOne({ _id: args.id })
      console.log(task);
      task.description = args.description

      try {
        await task.save()
      } catch (error) {
        throw new GraphQLError('description not saved', {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.id,
            error
          }
        })
      }

      return task
    },
    editPriority: async (root, args) => {
      const task = await Task.findOne({ _id: args.id })
      task.priority = args.priority

      try {
        await task.save()
      } catch (error) {
        throw new GraphQLError('Priority not saved', {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.id,
            error
          }
        })
      }

      return task
    },
    editStatus: async (root, args) => {
      const task = await Task.findOne({ _id: args.id })
      console.log(task);
      task.status = args.status

      try {
        await task.save()
      } catch (error) {
        throw new GraphQLError('status not saved', {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.id,
            error
          }
        })
      }

      return task
    },
    createUser: async (root, args) => {
      try {
        const { username, password } = args;
        // Check if user with the provided email already exists
        console.log('args', args)
        const existingUser = await User.findOne({ username });
        if (existingUser) {
          throw new Error('User with this email already exists');
        }
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);
        // Create a new user
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        return newUser;
      } catch (error) {
        throw new Error(error);
      }
    },
    login: async (root, args) => {
      try {
        const { username, password } = args;
        // Find user by email
        const user = await User.findOne({ username });
        if (!user) {
          throw new Error('Invalid credentials');
        }
        // Validate password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          throw new Error('Invalid credentials');
        }
        // Generate JWT token
        const userForToken = {
          username: user.username,
          id: user._id,
        }

        return { value: jwt.sign(userForToken, process.env.JWT_SECRET) }
      } catch (error) {
        throw new Error(error);
      }
    },
    autogenerate: async (root, args) => {
      const text = await chatGPTDescriptionCompletion(args.title)
      console.log("correct place", text);
      return text
    },
    deleteCompletedTasks: async () => {
      try {
        // Find and delete all tasks with complete: true
        await Task.deleteMany({ complete: true });
        return "Completed tasks deleted successfully.";
      } catch (error) {
        throw new Error("Failed to delete completed tasks.");
      }
    }
  }
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chatGPTDescriptionCompletion(title) {
  const completion = await openai.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant designed to output a string description.",
      },
      { role: "user", content: `I am creating a tasks list, breakdown the task based on the title: ${title}` },
    ],
    model: "gpt-3.5-turbo-0125",
    response_format: { type: "text" },
  });
  console.log(completion.choices[0].message.content);
  return completion.choices[0].message.content
}

async function startApolloServer() {
  const server = new ApolloServerExpress({
    typeDefs,
    resolvers,
  });

  await server.start(); // Start Apollo Server

  const app = express(); // Create an Express app
  app.use(cors())

  // server.applyMiddleware({ app }); // Apply Apollo Server middleware to Express app

  server.applyMiddleware({ app, path: '/graphql' });


  // Serve the 'dist' folder statically
  app.use(express.static(path.join(__dirname, 'build')));

  const PORT = process.env.PORT || 4001;

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startApolloServer(); // Call the function to start Apollo Server
