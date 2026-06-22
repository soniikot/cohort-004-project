import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  getAllUsers,
  getUserById,
  getUserByEmail,
  getUsersByRole,
  createUser,
  updateUser,
  updateUserRole,
} from "./userService";

describe("userService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("createUser", () => {
    it("creates a user with the given fields", () => {
      const user = createUser({
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: schema.UserRole.Instructor,
        avatarUrl: "https://example.com/ada.png",
      });

      expect(user.id).toBeDefined();
      expect(user.name).toBe("Ada Lovelace");
      expect(user.email).toBe("ada@example.com");
      expect(user.role).toBe(schema.UserRole.Instructor);
      expect(user.avatarUrl).toBe("https://example.com/ada.png");
    });

    it("allows a null avatarUrl", () => {
      const user = createUser({
        name: "Grace Hopper",
        email: "grace@example.com",
        role: schema.UserRole.Admin,
        avatarUrl: null,
      });
      expect(user.avatarUrl).toBeNull();
    });
  });

  describe("getUserById", () => {
    it("returns the matching user", () => {
      const user = getUserById(base.user.id);
      expect(user?.email).toBe(base.user.email);
    });

    it("returns undefined for an unknown id", () => {
      expect(getUserById(9999)).toBeUndefined();
    });
  });

  describe("getUserByEmail", () => {
    it("returns the matching user", () => {
      const user = getUserByEmail(base.instructor.email);
      expect(user?.id).toBe(base.instructor.id);
    });

    it("returns undefined for an unknown email", () => {
      expect(getUserByEmail("nobody@example.com")).toBeUndefined();
    });
  });

  describe("getUsersByRole", () => {
    it("returns only users with the given role", () => {
      const students = getUsersByRole(schema.UserRole.Student);
      expect(students).toHaveLength(1);
      expect(students[0].id).toBe(base.user.id);

      const instructors = getUsersByRole(schema.UserRole.Instructor);
      expect(instructors).toHaveLength(1);
      expect(instructors[0].id).toBe(base.instructor.id);
    });
  });

  describe("getAllUsers", () => {
    it("returns every user", () => {
      expect(getAllUsers()).toHaveLength(2);
    });
  });

  describe("updateUser", () => {
    it("updates name, email and bio", () => {
      const updated = updateUser({
        id: base.user.id,
        name: "Renamed",
        email: "renamed@example.com",
        bio: "Hello there",
      });

      expect(updated.name).toBe("Renamed");
      expect(updated.email).toBe("renamed@example.com");
      expect(updated.bio).toBe("Hello there");
    });

    it("can clear the bio with null", () => {
      const updated = updateUser({
        id: base.user.id,
        name: base.user.name,
        email: base.user.email,
        bio: null,
      });
      expect(updated.bio).toBeNull();
    });
  });

  describe("updateUserRole", () => {
    it("changes the user's role", () => {
      const updated = updateUserRole(base.user.id, schema.UserRole.Admin);
      expect(updated.role).toBe(schema.UserRole.Admin);
    });
  });
});
