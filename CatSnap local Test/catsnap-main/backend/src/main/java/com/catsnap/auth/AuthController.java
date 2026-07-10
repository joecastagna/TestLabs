package com.catsnap.auth;

import com.catsnap.generated.tables.records.UsersRecord;
import jakarta.servlet.http.HttpServletResponse;
import org.jooq.DSLContext;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.OffsetDateTime;

import static com.catsnap.generated.Tables.USERS;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final DSLContext dsl;
    private final BCryptPasswordEncoder encoder;
    private final JwtService jwtService;
    private final EmailService emailService;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthController(DSLContext dsl, BCryptPasswordEncoder encoder,
                          JwtService jwtService, EmailService emailService) {
        this.dsl = dsl;
        this.encoder = encoder;
        this.jwtService = jwtService;
        this.emailService = emailService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request, HttpServletResponse response) {
        UsersRecord user = dsl.selectFrom(USERS).where(USERS.EMAIL.eq(request.email())).fetchOne();
        if (user == null || !encoder.matches(request.password(), user.getHashedPassword())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse("Invalid credentials"));
        }
        if (!Boolean.TRUE.equals(user.getEmailVerified())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse("Please verify your email before logging in"));
        }
        setJwtCookie(response, jwtService.generateToken(request.email()));
        return ResponseEntity.ok(new LoginSuccess(request.email(), user.getUsername()));
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest request, HttpServletResponse response) {
        if (request.username() == null || request.username().isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse("Username is required"));
        }
        if (dsl.fetchExists(USERS, USERS.EMAIL.eq(request.email()))) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("Email already in use"));
        }
        if (dsl.fetchExists(USERS, USERS.USERNAME.eq(request.username()))) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("Username already taken"));
        }
        String code = String.format("%06d", secureRandom.nextInt(1_000_000));
        dsl.insertInto(USERS, USERS.EMAIL, USERS.USERNAME, USERS.HASHED_PASSWORD,
                       USERS.EMAIL_VERIFIED, USERS.VERIFICATION_CODE, USERS.VERIFICATION_CODE_EXPIRES_AT)
                .values(request.email(), request.username(), encoder.encode(request.password()),
                        false, code, OffsetDateTime.now().plusMinutes(15))
                .execute();
        emailService.sendVerificationEmail(request.email(), code);
        return ResponseEntity.status(HttpStatus.CREATED).body(new RegisterPending(request.email(), request.username()));
    }

    @PostMapping("/verify")
    public ResponseEntity<?> verify(@RequestBody VerifyRequest request, HttpServletResponse response) {
        UsersRecord user = dsl.selectFrom(USERS).where(USERS.EMAIL.eq(request.email())).fetchOne();
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("User not found"));
        }
        if (Boolean.TRUE.equals(user.getEmailVerified())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("Email already verified"));
        }
        if (!request.code().equals(user.getVerificationCode())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse("Invalid verification code"));
        }
        if (user.getVerificationCodeExpiresAt() == null
                || OffsetDateTime.now().isAfter(user.getVerificationCodeExpiresAt())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse("Verification code has expired"));
        }
        dsl.update(USERS)
                .set(USERS.EMAIL_VERIFIED, true)
                .set(USERS.VERIFICATION_CODE, (String) null)
                .set(USERS.VERIFICATION_CODE_EXPIRES_AT, (OffsetDateTime) null)
                .where(USERS.EMAIL.eq(request.email()))
                .execute();
        setJwtCookie(response, jwtService.generateToken(request.email()));
        return ResponseEntity.ok(new LoginSuccess(request.email(), user.getUsername()));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(@CurrentUser String email) {
        UsersRecord user = dsl.selectFrom(USERS).where(USERS.EMAIL.eq(email)).fetchOne();
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(new MeResponse(user.getId(), email, user.getUsername(), user.getCreatedAt()));
    }

    @PutMapping("/username")
    public ResponseEntity<?> changeUsername(@RequestBody UsernameChangeRequest request, @CurrentUser String email) {
        if (request.username() == null || request.username().isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse("Username is required"));
        }
        if (dsl.fetchExists(USERS, USERS.USERNAME.eq(request.username()).and(USERS.EMAIL.ne(email)))) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("Username already taken"));
        }
        dsl.update(USERS).set(USERS.USERNAME, request.username()).where(USERS.EMAIL.eq(email)).execute();
        return ResponseEntity.ok(new UsernameResponse(request.username()));
    }

    @PutMapping("/password")
    public ResponseEntity<?> changePassword(@RequestBody PasswordChangeRequest request, @CurrentUser String email) {
        String hashed = dsl.select(USERS.HASHED_PASSWORD)
                .from(USERS)
                .where(USERS.EMAIL.eq(email))
                .fetchOne(USERS.HASHED_PASSWORD);
        if (hashed == null || !encoder.matches(request.currentPassword(), hashed)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse("Current password is incorrect"));
        }
        dsl.update(USERS)
                .set(USERS.HASHED_PASSWORD, encoder.encode(request.newPassword()))
                .where(USERS.EMAIL.eq(email))
                .execute();
        return ResponseEntity.ok().build();
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from("jwt", "")
                .httpOnly(true).path("/").maxAge(0).sameSite("Lax").build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        return ResponseEntity.ok().build();
    }

    private void setJwtCookie(HttpServletResponse response, String token) {
        ResponseCookie cookie = ResponseCookie.from("jwt", token)
                .httpOnly(true)
                .path("/")
                .maxAge(Duration.ofMillis(jwtService.getExpirationMs()))
                .sameSite("Lax")
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private record LoginSuccess(String email, String username) {}
    private record RegisterPending(String email, String username) {}
    private record VerifyRequest(String email, String code) {}
    private record ErrorResponse(String error) {}
    private record MeResponse(long id, String email, String username, OffsetDateTime createdAt) {}
    private record PasswordChangeRequest(String currentPassword, String newPassword) {}
    private record UsernameChangeRequest(String username) {}
    private record UsernameResponse(String username) {}
}
