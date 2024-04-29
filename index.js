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
      const foundTask = await Task.findOne({ title: args.task.title })
      console.log('argeesssssss',args)
      if (!foundTask) {
        const task = new Task({ title: args.task })
        try {
          await task.save()
        } catch (error) {
          console.log('error', error);
        }
      }

      const foundTask2 = await Task.findOne({ title: args.task.title })
      const task = new Task({ ...args, task: foundTask2 })

      try {
        await task.save()
      } catch (error) {
        console.log('error', error);
      }

      return task
    },
    editBorn: async (root, args) => {

      const task = await Task.findOne({ name: args.name })
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