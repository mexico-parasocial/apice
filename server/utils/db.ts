import { PrismaClient } from "@prisma/client";

/**
 * The password hash is omitted from every `user` query by default.
 *
 * It used to travel to the client on login/register/activate (sendToken sends
 * the whole user object) and into the Redis session cache. Rather than
 * sanitising at each of those boundaries — and hoping the next one remembers —
 * the field simply does not come out of the database unless a query opts in
 * with `omit: { password: false }`. Only the credential check does that.
 */
const prisma = new PrismaClient({
  omit: {
    user: { password: true },
  },
});

const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log("Prisma connected to Database");
  } catch (error: any) {
    console.log(`Prisma connection failed: ${error.message}`);
    setTimeout(connectDB, 5000);
  }
};

export { prisma };
export default connectDB;
