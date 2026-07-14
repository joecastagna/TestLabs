package com.catsnap;

import org.jooq.DSLContext;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import static com.catsnap.generated.Tables.USERS;

@Component
@Profile("dev")
public class DevDataSeeder implements CommandLineRunner {

    private final DSLContext dsl;
    private final BCryptPasswordEncoder encoder;

    public DevDataSeeder(DSLContext dsl, BCryptPasswordEncoder encoder) {
        this.dsl = dsl;
        this.encoder = encoder;
    }

    @Override
    public void run(String... args) {
        if (!dsl.fetchExists(USERS, USERS.EMAIL.eq("dev@catsnap.local"))) {
            dsl.insertInto(USERS, USERS.EMAIL, USERS.USERNAME, USERS.HASHED_PASSWORD, USERS.EMAIL_VERIFIED)
                    .values("dev@catsnap.local", "devuser", encoder.encode("devpassword"), true)
                    .execute();
            System.out.println("[dev] Seeded dev user: dev@catsnap.local / devpassword");
        } else {
            System.out.println("[dev] Dev user already exists, skipping seed.");
        }
    }
}
