const { ApolloServer } = require('@apollo/server')
const { startStandaloneServer } = require('@apollo/server/standalone')
const { v1: uuid } = require('uuid')
const { GraphQLError } = require('graphql')
const mongoose = require('mongoose')
const Task = require('./models/task')
const User = require('./models/user')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs');

mongoose.set('strictQuery', false)


require('dotenv').config()

const MONGODB_URI = process.env.MONGODB_URI

console.log('connecting to', MONGODB_URI)

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
    ): Task
    editBorn(
      name: String!
      born: Int!
    ): Task
    createUser(
      username: String!
      password: String!
    ): User
    login(
      username: String!
      password: String!
    ): Token
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
        
        // Create and save a new task
        const newTask = new Task({ ...args });
        await newTask.save();
        
        console.log('newTask', newTask)
        return newTask;
      } catch (error) {
        // Handle errors
        console.error('Error adding task:', error);
        throw new Error('Failed to add task');
      }
    },
    editBorn: async (root, args) => {

      const task = await Task.findOne({ name: args.title })
      task.born = args.born

      try {
        await task.save()
      } catch (error) {
        throw new GraphQLError('Saving number failed', {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.name,
            error
          }
        })
      }

      return task
    },
    createUser: async (root, args) => {
      try {
        const {username, password } = args;
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
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

startStandaloneServer(server, {
  listen: { port: 4001 },
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})