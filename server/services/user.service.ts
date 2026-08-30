import { Response } from "express";
import { redis } from "../utils/redis";
import { prisma } from "../utils/db";
import { SESSION_CACHE_TTL_SECONDS } from "../utils/cache";

// get user by id
export const getUserById = async (id: string, res: Response) => {
  const userJson = await redis.get(id);

  if (userJson) {
    const user = JSON.parse(userJson);
    res.status(200).json({
      success: true,
      user,
    });
  } else {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Cache the user for future requests
    await redis.set(id, JSON.stringify(user), "EX", SESSION_CACHE_TTL_SECONDS);

    res.status(200).json({
      success: true,
      user,
    });
  }
};

// Get All users
export const getAllUsersService = async (
  res: Response,
  page = 1,
  limit = 50
) => {
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

  res.status(200).json({
    success: true,
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
  });
};

// update user role
export const updateUserRoleService = async (
  res: Response,
  id: string,
  role: string
) => {
  const user = await prisma.user.update({
    where: { id },
    data: { role },
  });

  // The auth middleware serves req.user from the Redis session cache, so
  // without this delete a promotion/demotion would take up to seven days
  // (the cache TTL) to affect what the user can actually do.
  await redis.del(id);

  res.status(200).json({
    success: true,
    user,
  });
};
