import { prisma } from "../utils/db";
import { cacheUser, loadUser } from "../utils/jwt";

// get user by id: the user cache first, then the database. Resolves to
// null when the user does not exist; the caller decides what to answer.
export const getUserById = (id: string) => loadUser(id);

// Get All users
export const getAllUsersService = async (page = 1, limit = 50) => {
  const [total, users] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      skip: (page - 1) * limit,
      include: {
        _count: { select: { enrollments: true } },
      },
    }),
  ]);

  return {
    // The password hash is omitted at the client level (utils/db.ts), so it
    // cannot reach here. `enrollments` is the course count the admin grid renders.
    users: users.map(({ _count, ...user }) => ({
      ...user,
      enrollments: new Array(_count.enrollments),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      hasMore: page * limit < total,
    },
  };
};

// update user role
export const updateUserRoleService = async (id: string, role: string) => {
  const user = await prisma.user.update({
    where: { id },
    data: { role },
  });

  // The auth middleware serves req.user from the user cache: refresh it so
  // the new role applies on the user's next request, without logging them
  // out.
  await cacheUser(user);

  return user;
};
